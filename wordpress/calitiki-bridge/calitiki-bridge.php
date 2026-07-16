<?php
/**
 * Plugin Name: Calitiki Bridge
 * Description: Connecte les comptes WooCommerce Calitiki au générateur de livres hébergé sur Render.
 * Version: 0.5.0
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
    const VERSION_OPTION = 'calitiki_bridge_version';
    const STATE_COOKIE = 'calitiki_bridge_state';
    const EBOOK_SLUG = 'livre-enfant-personnalise-ebook';
    const PRINT_SLUG = 'livre-enfant-personnalise-imprime';

    public static function init() {
        add_action('init', array(__CLASS__, 'register_account_endpoint'));
        add_action('admin_menu', array(__CLASS__, 'admin_menu'));
        add_action('template_redirect', array(__CLASS__, 'maybe_connect_customer'));
        add_action('template_redirect', array(__CLASS__, 'maybe_add_personalized_checkout'));
        add_filter('woocommerce_login_redirect', array(__CLASS__, 'login_redirect'), 10, 2);
        add_filter('woocommerce_registration_redirect', array(__CLASS__, 'registration_redirect'));
        add_action('woocommerce_before_customer_login_form', array(__CLASS__, 'login_notice'));
        add_filter('plugin_action_links_' . plugin_basename(__FILE__), array(__CLASS__, 'settings_link'));
        add_action('woocommerce_product_options_general_product_data', array(__CLASS__, 'credit_product_field'));
        add_action('woocommerce_process_product_meta', array(__CLASS__, 'save_credit_product_field'));
        add_action('woocommerce_payment_complete', array(__CLASS__, 'grant_order_credits'));
        add_action('woocommerce_order_status_processing', array(__CLASS__, 'grant_order_credits'));
        add_action('woocommerce_order_status_completed', array(__CLASS__, 'grant_order_credits'));
        add_action('wp', array(__CLASS__, 'replace_personalized_add_to_cart'));
        add_filter('woocommerce_loop_add_to_cart_link', array(__CLASS__, 'personalized_loop_link'), 10, 3);
        add_filter('woocommerce_add_to_cart_validation', array(__CLASS__, 'validate_personalized_add_to_cart'), 10, 6);
        add_action('woocommerce_before_calculate_totals', array(__CLASS__, 'apply_preview_rebate'));
        add_filter('woocommerce_get_item_data', array(__CLASS__, 'personalized_cart_item_data'), 10, 2);
        add_action('woocommerce_checkout_create_order_line_item', array(__CLASS__, 'personalized_order_item_data'), 10, 4);
        add_action('woocommerce_payment_complete', array(__CLASS__, 'book_order_paid'));
        add_action('woocommerce_order_status_processing', array(__CLASS__, 'book_order_paid'));
        add_action('woocommerce_order_status_completed', array(__CLASS__, 'book_order_paid'));
        add_action('woocommerce_checkout_order_processed', array(__CLASS__, 'maybe_book_order_paid'), 20, 3);
        add_action('woocommerce_order_status_cancelled', array(__CLASS__, 'book_order_cancelled'));
        add_action('woocommerce_order_status_failed', array(__CLASS__, 'book_order_failed'));
        add_action('woocommerce_order_refunded', array(__CLASS__, 'book_order_refunded'), 10, 2);
        add_action('calitiki_retry_book_order', array(__CLASS__, 'retry_book_order'), 10, 2);
        add_filter('woocommerce_account_menu_items', array(__CLASS__, 'account_menu_items'));
        add_action('woocommerce_account_calitiki-credits_endpoint', array(__CLASS__, 'render_account_credits'));
        add_action('woocommerce_account_calitiki-creations_endpoint', array(__CLASS__, 'render_account_creations'));
    }

    public static function activate() {
        if (!get_option(self::GENERATOR_URL_OPTION)) {
            update_option(self::GENERATOR_URL_OPTION, 'https://storybook-mcp.onrender.com');
        }
        if (!get_option(self::SHARED_SECRET_OPTION)) {
            update_option(self::SHARED_SECRET_OPTION, wp_generate_password(64, false, false));
        }
        self::register_account_endpoint();
        flush_rewrite_rules();
    }

    public static function register_account_endpoint() {
        add_rewrite_endpoint('calitiki-credits', EP_ROOT | EP_PAGES);
        add_rewrite_endpoint('calitiki-creations', EP_ROOT | EP_PAGES);
        if (get_option(self::VERSION_OPTION) !== '0.5.0') {
            update_option(self::VERSION_OPTION, '0.5.0');
            flush_rewrite_rules(false);
        }
    }

    public static function account_menu_items($items) {
        $logout = isset($items['customer-logout']) ? $items['customer-logout'] : null;
        unset($items['customer-logout']);
        $items['calitiki-creations'] = __('Mes créations Calitiki', 'calitiki-bridge');
        $items['calitiki-credits'] = __('Mes crédits Calitiki', 'calitiki-bridge');
        if ($logout !== null) {
            $items['customer-logout'] = $logout;
        }
        return $items;
    }

    private static function wallet_payload($customer_id) {
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        if (!$generator_url || strlen($secret) < 32) {
            return new WP_Error('calitiki_wallet_config', __('Le portefeuille Calitiki n’est pas encore configuré.', 'calitiki-bridge'));
        }
        $timestamp = time();
        $signature = hash_hmac('sha256', 'wallet|' . $customer_id . '|' . $timestamp, $secret);
        $response = wp_remote_get(add_query_arg(array('wooCustomerId' => (string) $customer_id, 'timestamp' => $timestamp), $generator_url . '/api/commerce/wallet'), array(
            'timeout' => 20,
            'headers' => array('X-Calitiki-Signature' => $signature),
        ));
        if (is_wp_error($response)) {
            return $response;
        }
        $status = wp_remote_retrieve_response_code($response);
        $payload = json_decode(wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || !is_array($payload)) {
            return new WP_Error('calitiki_wallet_unavailable', __('Impossible de consulter le portefeuille pour le moment.', 'calitiki-bridge'));
        }
        return $payload;
    }

    private static function wallet_entry_label($entry_type) {
        $labels = array(
            'woocommerce_credit_purchase' => __('Achat de crédits', 'calitiki-bridge'),
            'promotion_grant' => __('Code promotionnel', 'calitiki-bridge'),
            'preview_reserve' => __('Création d’un aperçu', 'calitiki-bridge'),
            'preview_release' => __('Crédit restitué après un échec technique', 'calitiki-bridge'),
        );
        return isset($labels[$entry_type]) ? $labels[$entry_type] : __('Mouvement de crédits', 'calitiki-bridge');
    }

    public static function render_account_credits() {
        $customer_id = get_current_user_id();
        $wallet = self::wallet_payload($customer_id);
        echo '<div class="calitiki-wallet-account">';
        echo '<h2>' . esc_html__('Mes crédits Calitiki', 'calitiki-bridge') . '</h2>';
        if (is_wp_error($wallet)) {
            wc_print_notice($wallet->get_error_message(), 'error');
            echo '</div>';
            return;
        }
        $balance_cents = intval($wallet['balanceCents'] ?? 0);
        $buy_url = !empty($wallet['buyCreditsUrl']) ? esc_url($wallet['buyCreditsUrl']) : esc_url(wc_get_page_permalink('shop'));
        echo '<div class="calitiki-wallet-summary"><div><span>' . esc_html__('Solde disponible', 'calitiki-bridge') . '</span><strong>' . wp_kses_post(wc_price($balance_cents / 100)) . '</strong></div>';
        echo '<a class="button alt" href="' . $buy_url . '">' . esc_html__('Acheter des crédits', 'calitiki-bridge') . '</a></div>';
        echo '<p>' . esc_html__('Les crédits utilisés pour un aperçu réussi sont déduits du prix de cette création lors de son achat.', 'calitiki-bridge') . '</p>';
        echo '<h3>' . esc_html__('Historique', 'calitiki-bridge') . '</h3>';
        $history = !empty($wallet['history']) && is_array($wallet['history']) ? $wallet['history'] : array();
        if (!$history) {
            echo '<p>' . esc_html__('Aucun mouvement de crédits pour le moment.', 'calitiki-bridge') . '</p>';
        } else {
            echo '<div class="calitiki-wallet-table-wrap"><table class="shop_table shop_table_responsive"><thead><tr><th>' . esc_html__('Date', 'calitiki-bridge') . '</th><th>' . esc_html__('Opération', 'calitiki-bridge') . '</th><th>' . esc_html__('Montant', 'calitiki-bridge') . '</th></tr></thead><tbody>';
            foreach ($history as $entry) {
                $amount = intval($entry['amountCents'] ?? 0);
                $timestamp = !empty($entry['createdAt']) ? strtotime($entry['createdAt']) : false;
                $date = $timestamp ? wp_date(get_option('date_format') . ' ' . get_option('time_format'), $timestamp) : '—';
                echo '<tr><td>' . esc_html($date) . '</td><td>' . esc_html(self::wallet_entry_label(sanitize_key($entry['entryType'] ?? ''))) . '</td><td class="' . ($amount >= 0 ? 'is-credit' : 'is-debit') . '">' . ($amount > 0 ? '+' : '') . wp_kses_post(wc_price($amount / 100)) . '</td></tr>';
            }
            echo '</tbody></table></div>';
        }
        echo '<style>.calitiki-wallet-summary{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px;margin:18px 0;border:1px solid #ead8c8;border-radius:18px;background:#fffaf4}.calitiki-wallet-summary div{display:grid;gap:4px}.calitiki-wallet-summary span{font-size:13px;color:#667a7c}.calitiki-wallet-summary strong{font-size:30px;color:#24393d}.calitiki-wallet-table-wrap{overflow-x:auto}.calitiki-wallet-account .is-credit{color:#357564;font-weight:700}.calitiki-wallet-account .is-debit{color:#a24d43;font-weight:700}@media(max-width:600px){.calitiki-wallet-summary{align-items:stretch;flex-direction:column}}</style>';
        echo '</div>';
    }

    private static function fresh_ebook_link($order_id, $customer_id, $project_id) {
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        if (!$generator_url || strlen($secret) < 32) {
            return '';
        }
        $timestamp = time();
        $signature = hash_hmac('sha256', 'delivery-link|' . $order_id . '|' . $customer_id . '|' . $project_id . '|' . $timestamp, $secret);
        $url = add_query_arg(array('orderId' => (string) $order_id, 'wooCustomerId' => (string) $customer_id, 'projectId' => (string) $project_id, 'timestamp' => $timestamp), $generator_url . '/api/commerce/ebook-download-link');
        $response = wp_remote_get($url, array('timeout' => 20, 'headers' => array('X-Calitiki-Signature' => $signature)));
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) < 200 || wp_remote_retrieve_response_code($response) >= 300) {
            return '';
        }
        $payload = json_decode(wp_remote_retrieve_body($response), true);
        return esc_url_raw($payload['delivery']['downloadUrl'] ?? '');
    }

    public static function render_account_creations() {
        $customer_id = get_current_user_id();
        echo '<div class="calitiki-creations-account"><h2>' . esc_html__('Mes créations Calitiki', 'calitiki-bridge') . '</h2>';
        $orders = wc_get_orders(array('customer_id' => $customer_id, 'limit' => -1, 'orderby' => 'date', 'order' => 'DESC', 'status' => array('wc-processing', 'wc-completed')));
        $found = false;
        echo '<div class="calitiki-creation-grid">';
        foreach ($orders as $order) {
            foreach ($order->get_items() as $item) {
                $project_id = (string) $item->get_meta('_calitiki_project_id', true);
                $product_type = sanitize_key((string) $item->get_meta('_calitiki_product_type', true));
                if (!$project_id || !in_array($product_type, array('ebook', 'print'), true)) {
                    continue;
                }
                $found = true;
                $pages = absint($item->get_meta('_calitiki_page_count', true));
                $download_url = $product_type === 'ebook' ? self::fresh_ebook_link($order->get_id(), $customer_id, $project_id) : '';
                echo '<article class="calitiki-creation-card"><span>' . esc_html($product_type === 'ebook' ? __('eBook personnalisé', 'calitiki-bridge') : __('Livre imprimé personnalisé', 'calitiki-bridge')) . '</span>';
                echo '<h3>' . esc_html($item->get_name()) . '</h3><p>' . esc_html(sprintf(__('Commande n°%1$s · %2$d pages', 'calitiki-bridge'), $order->get_order_number(), $pages)) . '</p>';
                if ($download_url) {
                    echo '<a class="button alt" href="' . esc_url($download_url) . '">' . esc_html__('Télécharger mon eBook', 'calitiki-bridge') . '</a>';
                } elseif ($product_type === 'ebook') {
                    echo '<p class="calitiki-delivery-pending">' . esc_html__('Votre eBook est en cours de préparation. Actualisez cette page dans quelques instants.', 'calitiki-bridge') . '</p>';
                } else {
                    echo '<a class="button" href="' . esc_url($order->get_view_order_url()) . '">' . esc_html__('Suivre ma commande', 'calitiki-bridge') . '</a>';
                }
                echo '</article>';
            }
        }
        if (!$found) {
            echo '<p>' . esc_html__('Aucune création achetée pour le moment.', 'calitiki-bridge') . '</p>';
        }
        echo '</div><style>.calitiki-creation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.calitiki-creation-card{padding:22px;border:1px solid #ead8c8;border-radius:18px;background:#fffaf4}.calitiki-creation-card>span{font-size:12px;font-weight:800;color:#c96f57;text-transform:uppercase;letter-spacing:.08em}.calitiki-creation-card h3{margin:8px 0}.calitiki-delivery-pending{color:#667a7c}@media(max-width:700px){.calitiki-creation-grid{grid-template-columns:1fr}}</style></div>';
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

    private static function base64url_decode($value) {
        $padding = strlen($value) % 4;
        if ($padding) {
            $value .= str_repeat('=', 4 - $padding);
        }
        return base64_decode(strtr($value, '-_', '+/'), true);
    }

    private static function decode_checkout_token($token) {
        $parts = explode('.', (string) $token);
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        if (count($parts) !== 2 || strlen($secret) < 32) {
            return null;
        }
        $expected = self::base64url_encode(hash_hmac('sha256', $parts[0], $secret, true));
        if (!hash_equals($expected, $parts[1])) {
            return null;
        }
        $json = self::base64url_decode($parts[0]);
        $payload = $json ? json_decode($json, true) : null;
        if (!is_array($payload) || empty($payload['exp']) || absint($payload['exp']) < time()) {
            return null;
        }
        return $payload;
    }

    private static function personalized_format($product) {
        $product = is_object($product) ? $product : (function_exists('wc_get_product') ? wc_get_product($product) : null);
        if (!$product) {
            return '';
        }
        if ($product->is_type('variation')) {
            $product = wc_get_product($product->get_parent_id());
        }
        if (!$product) {
            return '';
        }
        $slug = $product->get_slug();
        if ($slug === self::EBOOK_SLUG || $product->get_sku() === 'CAL-EBOOK') {
            return 'ebook';
        }
        if ($slug === self::PRINT_SLUG || $product->get_sku() === 'CAL-PRINT-21') {
            return 'print';
        }
        return '';
    }

    private static function product_for_format($format) {
        $slug = $format === 'ebook' ? self::EBOOK_SLUG : self::PRINT_SLUG;
        $post = get_page_by_path($slug, OBJECT, 'product');
        return $post && function_exists('wc_get_product') ? wc_get_product($post->ID) : null;
    }

    private static function variation_for_pages($product, $pages) {
        if (!$product || !$product->is_type('variable')) {
            return null;
        }
        foreach ($product->get_children() as $variation_id) {
            $variation = wc_get_product($variation_id);
            if (!$variation) {
                continue;
            }
            foreach ($variation->get_attributes() as $value) {
                if ((string) $value === (string) $pages) {
                    return $variation;
                }
            }
        }
        return null;
    }

    private static function generator_personalize_url($format) {
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, 'https://storybook-mcp.onrender.com'));
        return add_query_arg(array('newBook' => '1', 'productType' => $format), $generator_url) . '#creator';
    }

    public static function replace_personalized_add_to_cart() {
        if (!function_exists('is_product') || !is_product()) {
            return;
        }
        $product = function_exists('wc_get_product') ? wc_get_product(get_queried_object_id()) : null;
        if (!self::personalized_format($product)) {
            return;
        }
        remove_action('woocommerce_single_product_summary', 'woocommerce_template_single_add_to_cart', 30);
        add_action('woocommerce_single_product_summary', array(__CLASS__, 'personalize_product_cta'), 30);
    }

    public static function personalize_product_cta() {
        global $product;
        $format = self::personalized_format($product);
        if (!$format) {
            return;
        }
        $label = $format === 'ebook' ? __('Personnaliser votre eBook', 'calitiki-bridge') : __('Personnaliser votre livre imprimé', 'calitiki-bridge');
        echo '<div class="calitiki-personalize-cta">';
        echo '<p>' . esc_html__('Ce livre est créé sur mesure. Personnalisez et prévisualisez votre histoire avant de l’ajouter au panier.', 'calitiki-bridge') . '</p>';
        echo '<a class="button alt" href="' . esc_url(self::generator_personalize_url($format)) . '">' . esc_html($label) . ' &rarr;</a>';
        echo '</div>';
    }

    public static function personalized_loop_link($html, $product, $args) {
        if (!self::personalized_format($product)) {
            return $html;
        }
        return sprintf('<a href="%s" class="button product_type_variable">%s</a>', esc_url(get_permalink($product->get_id())), esc_html__('Découvrir et personnaliser', 'calitiki-bridge'));
    }

    public static function validate_personalized_add_to_cart($passed, $product_id, $quantity, $variation_id = 0, $variations = array(), $cart_item_data = array()) {
        if (!self::personalized_format($variation_id ?: $product_id)) {
            return $passed;
        }
        if (!empty($cart_item_data['_calitiki_authorized']) && !empty($cart_item_data['calitiki_project_id'])) {
            return $passed;
        }
        wc_add_notice(__('Personnalisez d’abord votre livre et générez son aperçu avant de l’ajouter au panier.', 'calitiki-bridge'), 'notice');
        return false;
    }

    public static function maybe_add_personalized_checkout() {
        if (empty($_GET['calitiki_checkout'])) {
            return;
        }
        nocache_headers();
        if (!is_user_logged_in()) {
            wp_safe_redirect(function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : wp_login_url());
            exit;
        }
        $token = isset($_GET['token']) ? sanitize_text_field(wp_unslash($_GET['token'])) : '';
        $payload = self::decode_checkout_token($token);
        $user = wp_get_current_user();
        if (!$payload || (string) ($payload['sub'] ?? '') !== (string) $user->ID) {
            wp_die(esc_html__('Le lien d’achat Calitiki est invalide ou a expiré.', 'calitiki-bridge'), 'Calitiki', array('response' => 403));
        }
        $token_key = 'calitiki_checkout_' . md5($token);
        if (get_transient($token_key)) {
            wp_die(esc_html__('Ce lien d’achat Calitiki a déjà été utilisé. Revenez à votre aperçu pour rouvrir le panier.', 'calitiki-bridge'), 'Calitiki', array('response' => 409));
        }
        $format = sanitize_key($payload['productType'] ?? '');
        $pages = absint($payload['pageCount'] ?? 0);
        $project_id = sanitize_text_field($payload['projectId'] ?? '');
        if (!in_array($format, array('ebook', 'print'), true) || !in_array($pages, array(24, 28, 32, 36, 40, 44), true) || !$project_id) {
            wp_die(esc_html__('La configuration du livre est invalide.', 'calitiki-bridge'), 'Calitiki', array('response' => 400));
        }
        $product = self::product_for_format($format);
        $variation = self::variation_for_pages($product, $pages);
        if (!$product || !$variation || !function_exists('WC') || !WC()->cart) {
            wp_die(esc_html__('La variation WooCommerce correspondant à ce livre est introuvable.', 'calitiki-bridge'), 'Calitiki', array('response' => 503));
        }
        foreach (WC()->cart->get_cart() as $cart_key => $cart_item) {
            if (($cart_item['calitiki_project_id'] ?? '') === $project_id) {
                WC()->cart->remove_cart_item($cart_key);
            }
        }
        $base_price_cents = (int) round((float) $variation->get_price() * 100);
        $cart_data = array(
            '_calitiki_authorized' => true,
            'calitiki_project_id' => $project_id,
            'calitiki_project_title' => sanitize_text_field($payload['projectTitle'] ?? __('Livre personnalisé', 'calitiki-bridge')),
            'calitiki_product_type' => $format,
            'calitiki_page_count' => $pages,
            'calitiki_rebate_cents' => max(0, absint($payload['rebateCents'] ?? 0)),
            'calitiki_reservation_id' => sanitize_text_field($payload['reservationId'] ?? ''),
            'calitiki_base_price_cents' => $base_price_cents,
            'unique_key' => md5($project_id . '|' . $format),
        );
        $added = WC()->cart->add_to_cart($product->get_id(), 1, $variation->get_id(), $variation->get_variation_attributes(), $cart_data);
        if (!$added) {
            wp_die(esc_html__('Le livre n’a pas pu être ajouté au panier.', 'calitiki-bridge'), 'Calitiki', array('response' => 500));
        }
        set_transient($token_key, '1', 15 * MINUTE_IN_SECONDS);
        wp_safe_redirect(wc_get_cart_url());
        exit;
    }

    public static function apply_preview_rebate($cart) {
        if (is_admin() && !defined('DOING_AJAX')) {
            return;
        }
        foreach ($cart->get_cart() as $cart_item) {
            if (empty($cart_item['calitiki_project_id']) || empty($cart_item['calitiki_base_price_cents'])) {
                continue;
            }
            $quantity = max(1, absint($cart_item['quantity'] ?? 1));
            $base_total = absint($cart_item['calitiki_base_price_cents']) * $quantity;
            $rebate = min($base_total, absint($cart_item['calitiki_rebate_cents'] ?? 0));
            $cart_item['data']->set_price(($base_total - $rebate) / 100 / $quantity);
        }
    }

    public static function personalized_cart_item_data($data, $cart_item) {
        if (empty($cart_item['calitiki_project_id'])) {
            return $data;
        }
        $data[] = array('key' => __('Création Calitiki', 'calitiki-bridge'), 'value' => sanitize_text_field($cart_item['calitiki_project_title']));
        $data[] = array('key' => __('Nombre de pages', 'calitiki-bridge'), 'value' => absint($cart_item['calitiki_page_count']));
        if (!empty($cart_item['calitiki_rebate_cents'])) {
            $data[] = array('key' => __('Crédit d’aperçu déduit', 'calitiki-bridge'), 'value' => wp_strip_all_tags(wc_price($cart_item['calitiki_rebate_cents'] / 100)));
        }
        return $data;
    }

    public static function personalized_order_item_data($item, $cart_item_key, $values, $order) {
        if (empty($values['calitiki_project_id'])) {
            return;
        }
        $item->add_meta_data('_calitiki_project_id', sanitize_text_field($values['calitiki_project_id']), true);
        $item->add_meta_data('_calitiki_checkout_reservation_id', sanitize_text_field($values['calitiki_reservation_id'] ?? ''), true);
        $item->add_meta_data('_calitiki_rebate_cents', absint($values['calitiki_rebate_cents'] ?? 0), true);
        $item->add_meta_data('_calitiki_product_type', sanitize_key($values['calitiki_product_type'] ?? ''), true);
        $item->add_meta_data('_calitiki_page_count', absint($values['calitiki_page_count'] ?? 0), true);
        $item->add_meta_data(__('Création Calitiki', 'calitiki-bridge'), sanitize_text_field($values['calitiki_project_title']), true);
        $item->add_meta_data(__('Nombre de pages', 'calitiki-bridge'), absint($values['calitiki_page_count']), true);
    }

    private static function schedule_book_order_retry($order_id, $status) {
        $args = array(absint($order_id), sanitize_key($status));
        if (!wp_next_scheduled('calitiki_retry_book_order', $args)) {
            wp_schedule_single_event(time() + 300, 'calitiki_retry_book_order', $args);
        }
    }

    private static function ebook_email_copy($order) {
        $locale = strtolower((string) $order->get_meta('_trp_language', true));
        if (!$locale) {
            $locale = strtolower((string) $order->get_meta('_order_locale', true));
        }
        if (!$locale && $order->get_customer_id()) {
            $locale = strtolower((string) get_user_locale($order->get_customer_id()));
        }
        if (strpos($locale, 'es') === 0) {
            return array('subject' => 'Tu eBook Calitiki está listo', 'heading' => '¡Tu historia está lista!', 'intro' => 'Tu eBook personalizado ya está preparado.', 'button' => 'Descargar mi eBook', 'expiry' => 'Por seguridad, este enlace es temporal. Siempre puedes obtener uno nuevo desde Mis creaciones en tu cuenta Calitiki.');
        }
        if (strpos($locale, 'en') === 0) {
            return array('subject' => 'Your Calitiki eBook is ready', 'heading' => 'Your story is ready!', 'intro' => 'Your personalized eBook is now ready.', 'button' => 'Download my eBook', 'expiry' => 'For security, this link is temporary. You can always get a new one from My creations in your Calitiki account.');
        }
        return array('subject' => 'Votre eBook Calitiki est prêt', 'heading' => 'Votre histoire est prête !', 'intro' => 'Votre eBook personnalisé est maintenant disponible.', 'button' => 'Télécharger mon eBook', 'expiry' => 'Pour votre sécurité, ce lien est temporaire. Vous pourrez toujours en obtenir un nouveau depuis Mes créations dans votre compte Calitiki.');
    }

    private static function send_ebook_ready_email($order, $item, $delivery) {
        if ($item->get_meta('_calitiki_ebook_email_sent', true)) {
            return true;
        }
        $download_url = esc_url_raw($delivery['downloadUrl'] ?? '');
        if (!$download_url || !function_exists('WC')) {
            return false;
        }
        $copy = self::ebook_email_copy($order);
        $mailer = WC()->mailer();
        $content = '<p>' . esc_html($copy['intro']) . '</p><p style="margin:28px 0"><a href="' . esc_url($download_url) . '" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#d8755b;color:#fff;text-decoration:none;font-weight:700">' . esc_html($copy['button']) . '</a></p><p>' . esc_html($copy['expiry']) . '</p>';
        $message = $mailer->wrap_message($copy['heading'], $content);
        $sent = $mailer->send($order->get_billing_email(), $copy['subject'], $message, "Content-Type: text/html\r\n", array());
        if ($sent) {
            $item->update_meta_data('_calitiki_ebook_ready', gmdate('c'));
            $item->update_meta_data('_calitiki_ebook_email_sent', gmdate('c'));
            $item->update_meta_data('_calitiki_ebook_download_expires', sanitize_text_field($delivery['expiresAt'] ?? ''));
            $item->save();
        }
        return (bool) $sent;
    }

    private static function notify_book_order($order_id, $status) {
        $order = function_exists('wc_get_order') ? wc_get_order($order_id) : null;
        if (!$order || !$order->get_customer_id()) {
            return;
        }
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        if (!$generator_url || strlen($secret) < 32) {
            return;
        }
        foreach ($order->get_items() as $item) {
            $project_id = (string) $item->get_meta('_calitiki_project_id', true);
            if (!$project_id) {
                continue;
            }
            $reservation_id = (string) $item->get_meta('_calitiki_checkout_reservation_id', true);
            $product_type = sanitize_key((string) $item->get_meta('_calitiki_product_type', true));
            if (!$product_type && $item->get_product()) {
                $product_type = (string) self::book_format_for_product($item->get_product());
            }
            $page_count = absint($item->get_meta('_calitiki_page_count', true));
            $order_total_cents = (int) round((float) $order->get_total() * 100);
            if (!in_array($product_type, array('ebook', 'print'), true) || !$page_count) {
                continue;
            }
            $marker = '_calitiki_book_' . $status . '_' . md5($project_id . '|' . $reservation_id);
            if ($order->get_meta($marker)) {
                continue;
            }
            $customer_id = (string) $order->get_customer_id();
            $signature_value = implode('|', array((string) $order_id, $customer_id, $project_id, $reservation_id, $product_type, (string) $page_count, (string) $order_total_cents, $status));
            $signature = hash_hmac('sha256', $signature_value, $secret);
            $response = wp_remote_post($generator_url . '/api/commerce/book-order-status', array(
                'timeout' => 60,
                'headers' => array('Content-Type' => 'application/json', 'X-Calitiki-Signature' => $signature),
                'body' => wp_json_encode(array('orderId' => (string) $order_id, 'wooCustomerId' => $customer_id, 'email' => $order->get_billing_email(), 'projectId' => $project_id, 'reservationId' => $reservation_id, 'productType' => $product_type, 'pageCount' => $page_count, 'orderTotalCents' => $order_total_cents, 'status' => $status)),
            ));
            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) >= 200 && wp_remote_retrieve_response_code($response) < 300) {
                $payload = json_decode(wp_remote_retrieve_body($response), true);
                $delivery = is_array($payload) && !empty($payload['fulfillment']) ? $payload['fulfillment'] : array();
                $email_ready = $status !== 'paid' || $product_type !== 'ebook' || (($delivery['status'] ?? '') === 'ready' && self::send_ebook_ready_email($order, $item, $delivery));
                if ($email_ready) {
                    $order->update_meta_data($marker, gmdate('c'));
                } else {
                    self::schedule_book_order_retry($order_id, $status);
                }
            } else {
                self::schedule_book_order_retry($order_id, $status);
            }
        }
        $order->save();
    }

    public static function book_order_paid($order_id) { self::notify_book_order($order_id, 'paid'); }
    public static function maybe_book_order_paid($order_id, $posted_data = array(), $order = null) {
        $order = $order instanceof WC_Order ? $order : (function_exists('wc_get_order') ? wc_get_order($order_id) : null);
        if ($order && (float) $order->get_total() <= 0 && !$order->is_paid()) {
            $order->payment_complete();
        }
        if ($order && ($order->is_paid() || ((float) $order->get_total() <= 0 && in_array($order->get_status(), array('processing', 'completed'), true)))) {
            self::notify_book_order($order_id, 'paid');
        }
    }
    public static function retry_book_order($order_id, $status) { self::notify_book_order($order_id, $status); }
    public static function book_order_cancelled($order_id) { self::notify_book_order($order_id, 'cancelled'); }
    public static function book_order_failed($order_id) { self::notify_book_order($order_id, 'failed'); }
    public static function book_order_refunded($order_id, $refund_id) { self::notify_book_order($order_id, 'refunded'); }

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
