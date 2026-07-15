<?php
/**
 * Plugin Name: Calitiki Bridge
 * Description: Connecte les comptes WooCommerce Calitiki au générateur de livres hébergé sur Render.
 * Version: 0.2.0
 * Author: Calitiki
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * WC requires at least: 8.0
 * Text Domain: calitiki-bridge
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Calitiki_Woo_Bridge {
    const GENERATOR_URL_OPTION = 'calitiki_generator_url';
    const SHARED_SECRET_OPTION = 'calitiki_bridge_secret';
    const STATE_COOKIE = 'calitiki_bridge_state';

    public static function init() {
        add_action('admin_menu', array(__CLASS__, 'admin_menu'));
        add_action('template_redirect', array(__CLASS__, 'maybe_connect_customer'));
        add_filter('woocommerce_login_redirect', array(__CLASS__, 'login_redirect'), 10, 2);
        add_filter('woocommerce_registration_redirect', array(__CLASS__, 'registration_redirect'));
        add_action('woocommerce_before_customer_login_form', array(__CLASS__, 'login_notice'));
        add_filter('plugin_action_links_' . plugin_basename(__FILE__), array(__CLASS__, 'settings_link'));
        add_action('woocommerce_product_options_general_product_data', array(__CLASS__, 'credit_product_field'));
        add_action('woocommerce_process_product_meta', array(__CLASS__, 'save_credit_product_field'));
        add_action('woocommerce_payment_complete', array(__CLASS__, 'grant_order_credits'));
        add_action('woocommerce_order_status_processing', array(__CLASS__, 'grant_order_credits'));
        add_action('woocommerce_order_status_completed', array(__CLASS__, 'grant_order_credits'));
    }

    public static function activate() {
        if (!get_option(self::GENERATOR_URL_OPTION)) {
            update_option(self::GENERATOR_URL_OPTION, 'https://storybook-mcp.onrender.com');
        }
        if (!get_option(self::SHARED_SECRET_OPTION)) {
            update_option(self::SHARED_SECRET_OPTION, wp_generate_password(64, false, false));
        }
    }

    public static function settings_link($links) {
        array_unshift($links, '<a href="' . esc_url(admin_url('admin.php?page=calitiki-bridge')) . '">' . esc_html__('Réglages', 'calitiki-bridge') . '</a>');
        return $links;
    }

    public static function admin_menu() {
        add_submenu_page(
            'woocommerce',
            'Calitiki Bridge',
            'Calitiki Bridge',
            'manage_woocommerce',
            'calitiki-bridge',
            array(__CLASS__, 'settings_page')
        );
    }

    public static function settings_page() {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }

        if (isset($_POST['calitiki_save_settings'])) {
            check_admin_referer('calitiki_bridge_settings');
            $generator_url = isset($_POST['calitiki_generator_url']) ? esc_url_raw(wp_unslash($_POST['calitiki_generator_url'])) : '';
            $secret = isset($_POST['calitiki_bridge_secret']) ? sanitize_text_field(wp_unslash($_POST['calitiki_bridge_secret'])) : '';
            if ($generator_url) {
                update_option(self::GENERATOR_URL_OPTION, untrailingslashit($generator_url));
            }
            if (!empty($_POST['calitiki_regenerate_secret'])) {
                $secret = wp_generate_password(64, false, false);
            }
            if (strlen($secret) >= 32) {
                update_option(self::SHARED_SECRET_OPTION, $secret);
            }
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Réglages enregistrés.', 'calitiki-bridge') . '</p></div>';
        }

        $generator_url = get_option(self::GENERATOR_URL_OPTION, 'https://storybook-mcp.onrender.com');
        $secret = get_option(self::SHARED_SECRET_OPTION, '');
        ?>
        <div class="wrap">
            <h1>Calitiki Bridge</h1>
            <p>Ce connecteur transmet uniquement un identifiant client signé au générateur. Aucun mot de passe WooCommerce ni aucune photo d’enfant ne quitte ce flux.</p>
            <form method="post">
                <?php wp_nonce_field('calitiki_bridge_settings'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="calitiki_generator_url">URL du générateur</label></th>
                        <td><input class="regular-text" type="url" id="calitiki_generator_url" name="calitiki_generator_url" value="<?php echo esc_attr($generator_url); ?>" required /></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="calitiki_bridge_secret">Secret partagé</label></th>
                        <td>
                            <div style="display:flex;gap:8px;align-items:center;max-width:900px;">
                                <input class="large-text code" type="password" id="calitiki_bridge_secret" name="calitiki_bridge_secret" value="<?php echo esc_attr($secret); ?>" minlength="32" autocomplete="new-password" required />
                                <button type="button" class="button" id="calitiki_toggle_secret">Afficher</button>
                                <button type="button" class="button" id="calitiki_copy_secret">Copier</button>
                            </div>
                            <p id="calitiki_secret_feedback" class="description" aria-live="polite"></p>
                            <p class="description">Copiez exactement cette valeur dans la variable Render <code>WOOCOMMERCE_BRIDGE_SECRET</code>.</p>
                            <label><input type="checkbox" name="calitiki_regenerate_secret" value="1" /> Générer un nouveau secret lors de l’enregistrement</label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">URL du pont</th>
                        <td>
                            <code><?php echo esc_html(self::bridge_url()); ?></code>
                            <p class="description">Copiez cette URL dans la variable Render <code>WOOCOMMERCE_BRIDGE_URL</code>.</p>
                        </td>
                    </tr>
                </table>
                <p class="submit"><button type="submit" name="calitiki_save_settings" class="button button-primary">Enregistrer les réglages</button></p>
            </form>
            <script>
                (function () {
                    const secret = document.getElementById('calitiki_bridge_secret');
                    const toggle = document.getElementById('calitiki_toggle_secret');
                    const copy = document.getElementById('calitiki_copy_secret');
                    const feedback = document.getElementById('calitiki_secret_feedback');

                    toggle.addEventListener('click', function () {
                        const reveal = secret.type === 'password';
                        secret.type = reveal ? 'text' : 'password';
                        toggle.textContent = reveal ? 'Masquer' : 'Afficher';
                    });

                    copy.addEventListener('click', async function () {
                        try {
                            await navigator.clipboard.writeText(secret.value);
                        } catch (error) {
                            secret.type = 'text';
                            secret.focus();
                            secret.select();
                            document.execCommand('copy');
                            secret.type = 'password';
                            toggle.textContent = 'Afficher';
                        }
                        feedback.textContent = 'Secret copié. Vous pouvez maintenant le coller dans Render.';
                    });
                }());
            </script>
        </div>
        <?php
    }

    public static function bridge_url() {
        return add_query_arg('calitiki_connect', '1', home_url('/'));
    }

    private static function callback_url() {
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        return $generator_url ? $generator_url . '/api/auth/woocommerce/callback' : '';
    }

    private static function pending_state() {
        $state = isset($_GET['state']) ? sanitize_text_field(wp_unslash($_GET['state'])) : '';
        if (!$state && isset($_COOKIE[self::STATE_COOKIE])) {
            $state = sanitize_text_field(wp_unslash($_COOKIE[self::STATE_COOKIE]));
        }
        return preg_match('/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/', $state) ? $state : '';
    }

    private static function set_state_cookie($state, $expires) {
        $options = array(
            'expires' => $expires,
            'path' => COOKIEPATH ? COOKIEPATH : '/',
            'secure' => is_ssl(),
            'httponly' => true,
            'samesite' => 'Lax',
        );
        if (defined('COOKIE_DOMAIN') && COOKIE_DOMAIN) {
            $options['domain'] = COOKIE_DOMAIN;
        }
        setcookie(self::STATE_COOKIE, $state, $options);
        if ($expires < time()) {
            unset($_COOKIE[self::STATE_COOKIE]);
        } else {
            $_COOKIE[self::STATE_COOKIE] = $state;
        }
    }

    private static function base64url_encode($value) {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function customer_token($user_id, $email, $secret) {
        $payload = self::base64url_encode(wp_json_encode(array(
            'sub' => (string) $user_id,
            'email' => (string) $email,
            'exp' => time() + 300,
        )));
        $signature = self::base64url_encode(hash_hmac('sha256', $payload, $secret, true));
        return $payload . '.' . $signature;
    }

    public static function maybe_connect_customer() {
        if (empty($_GET['calitiki_connect'])) {
            return;
        }

        nocache_headers();
        $state = self::pending_state();
        if (!$state) {
            wp_die(esc_html__('La demande de connexion Calitiki est absente ou invalide.', 'calitiki-bridge'), 'Calitiki', array('response' => 400));
        }

        self::set_state_cookie($state, time() + 10 * MINUTE_IN_SECONDS);
        if (!is_user_logged_in()) {
            $account_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : wp_login_url();
            wp_safe_redirect($account_url);
            exit;
        }

        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        $callback_url = self::callback_url();
        if (strlen($secret) < 32 || !$callback_url) {
            wp_die(esc_html__('Le connecteur Calitiki doit être configuré par un administrateur.', 'calitiki-bridge'), 'Calitiki', array('response' => 503));
        }

        $user = wp_get_current_user();
        $token = self::customer_token($user->ID, $user->user_email, $secret);
        self::set_state_cookie('', time() - HOUR_IN_SECONDS);
        $return_url = add_query_arg(array('token' => $token, 'state' => $state), $callback_url);
        wp_redirect($return_url, 302, 'Calitiki Bridge');
        exit;
    }

    public static function login_redirect($redirect, $user) {
        return self::pending_state() ? self::bridge_url() : $redirect;
    }

    public static function registration_redirect($redirect) {
        return self::pending_state() ? self::bridge_url() : $redirect;
    }

    public static function login_notice() {
        if (self::pending_state()) {
            wc_print_notice(__('Connectez-vous ou créez votre compte pour sauvegarder ce livre et générer son aperçu.', 'calitiki-bridge'), 'notice');
        }
    }

    public static function credit_product_field() {
        if (!function_exists('woocommerce_wp_text_input')) {
            return;
        }
        woocommerce_wp_text_input(array(
            'id' => '_calitiki_credit_cents',
            'label' => __('Crédits Calitiki (centimes)', 'calitiki-bridge'),
            'description' => __('Montant ajouté au portefeuille après paiement. Exemple : 250 pour 2,50 €.', 'calitiki-bridge'),
            'desc_tip' => true,
            'type' => 'number',
            'custom_attributes' => array('min' => '50', 'step' => '1'),
        ));
    }

    public static function save_credit_product_field($product_id) {
        if (!isset($_POST['_calitiki_credit_cents'])) {
            return;
        }
        $amount = absint(wp_unslash($_POST['_calitiki_credit_cents']));
        if ($amount >= 50) {
            update_post_meta($product_id, '_calitiki_credit_cents', $amount);
        } else {
            delete_post_meta($product_id, '_calitiki_credit_cents');
        }
    }

    public static function grant_order_credits($order_id) {
        if (!function_exists('wc_get_order')) {
            return;
        }
        $order = wc_get_order($order_id);
        if (!$order || $order->get_meta('_calitiki_credit_granted')) {
            return;
        }
        $customer_id = (string) $order->get_customer_id();
        if (!$customer_id) {
            return;
        }
        $amount_cents = 0;
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            if (!$product) {
                continue;
            }
            $credit_cents = absint($product->get_meta('_calitiki_credit_cents', true));
            $amount_cents += $credit_cents * max(1, absint($item->get_quantity()));
        }
        if ($amount_cents < 50) {
            return;
        }
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        if (!$generator_url || strlen($secret) < 32) {
            return;
        }
        $signature = hash_hmac('sha256', $order_id . '|' . $customer_id . '|' . $amount_cents, $secret);
        $response = wp_remote_post($generator_url . '/api/commerce/credit-order-paid', array(
            'timeout' => 20,
            'headers' => array('Content-Type' => 'application/json', 'X-Calitiki-Signature' => $signature),
            'body' => wp_json_encode(array(
                'orderId' => (string) $order_id,
                'wooCustomerId' => $customer_id,
                'email' => $order->get_billing_email(),
                'amountCents' => $amount_cents,
            )),
        ));
        if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) >= 200 && wp_remote_retrieve_response_code($response) < 300) {
            $order->update_meta_data('_calitiki_credit_granted', gmdate('c'));
            $order->save();
            $order->add_order_note(sprintf(__('Portefeuille Calitiki crédité de %s.', 'calitiki-bridge'), wc_price($amount_cents / 100)));
        }
    }
}

register_activation_hook(__FILE__, array('Calitiki_Woo_Bridge', 'activate'));
Calitiki_Woo_Bridge::init();
