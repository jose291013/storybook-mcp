<?php
/**
 * Plugin Name: Calitiki Bridge
 * Description: Connecte les comptes WooCommerce Calitiki au générateur de livres hébergé sur Render.
 * Version: 0.7.3
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
    const PRINT_BOOK_ENABLED_OPTION = 'calitiki_print_book_enabled';
    const STATE_COOKIE = 'calitiki_bridge_state';
    const EBOOK_SLUG = 'livre-enfant-personnalise-ebook';
    const PRINT_SLUG = 'livre-enfant-personnalise-imprime';
    const NARRATION_SLUG = 'narration-ia-calitiki';

    public static function init() {
        add_action('init', array(__CLASS__, 'register_account_endpoint'));
        add_action('admin_menu', array(__CLASS__, 'admin_menu'));
        add_action('template_redirect', array(__CLASS__, 'maybe_connect_customer'));
        add_action('template_redirect', array(__CLASS__, 'maybe_send_preview_ready_email'), 1);
        add_action('template_redirect', array(__CLASS__, 'capture_credit_return'), 5);
        add_action('template_redirect', array(__CLASS__, 'maybe_add_personalized_checkout'));
        add_filter('woocommerce_login_redirect', array(__CLASS__, 'login_redirect'), 10, 2);
        add_filter('woocommerce_registration_redirect', array(__CLASS__, 'registration_redirect'));
        add_action('woocommerce_before_customer_login_form', array(__CLASS__, 'login_notice'));
        add_filter('plugin_action_links_' . plugin_basename(__FILE__), array(__CLASS__, 'settings_link'));
        add_action('woocommerce_product_options_general_product_data', array(__CLASS__, 'credit_product_field'));
        add_action('woocommerce_process_product_meta', array(__CLASS__, 'save_credit_product_field'));
        add_filter('woocommerce_add_cart_item_data', array(__CLASS__, 'credit_return_cart_item_data'), 10, 3);
        add_action('woocommerce_checkout_create_order_line_item', array(__CLASS__, 'credit_return_order_item_data'), 10, 4);
        add_action('woocommerce_after_add_to_cart_form', array(__CLASS__, 'render_credit_return_navigation'), 20);
        add_action('woocommerce_before_cart', array(__CLASS__, 'render_credit_return_navigation'), 5);
        add_action('woocommerce_before_checkout_form', array(__CLASS__, 'render_credit_return_navigation'), 5);
        add_action('woocommerce_thankyou', array(__CLASS__, 'render_credit_return_after_order'), 20);
        add_action('woocommerce_payment_complete', array(__CLASS__, 'grant_order_credits'));
        add_action('woocommerce_order_status_processing', array(__CLASS__, 'grant_order_credits'));
        add_action('woocommerce_order_status_completed', array(__CLASS__, 'grant_order_credits'));
        add_action('wp', array(__CLASS__, 'replace_personalized_add_to_cart'));
        add_action('woocommerce_before_shop_loop_item_title', array(__CLASS__, 'catalog_product_badge'), 8);
        add_filter('woocommerce_loop_add_to_cart_link', array(__CLASS__, 'personalized_loop_link'), 10, 3);
        add_filter('woocommerce_product_is_purchasable', array(__CLASS__, 'product_is_purchasable'), 10, 2);
        add_filter('woocommerce_variation_is_purchasable', array(__CLASS__, 'product_is_purchasable'), 10, 2);
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
        add_action('admin_post_calitiki_resend_ebook', array(__CLASS__, 'resend_ebook_email'));
        add_action('admin_post_calitiki_delete_creation', array(__CLASS__, 'delete_creation'));
    }

    public static function activate() {
        if (!get_option(self::GENERATOR_URL_OPTION)) {
            update_option(self::GENERATOR_URL_OPTION, 'https://storybook-mcp.onrender.com');
        }
        if (!get_option(self::SHARED_SECRET_OPTION)) {
            update_option(self::SHARED_SECRET_OPTION, wp_generate_password(64, false, false));
        }
        add_option(self::PRINT_BOOK_ENABLED_OPTION, 'no');
        self::register_account_endpoint();
        flush_rewrite_rules();
    }

    public static function register_account_endpoint() {
        add_rewrite_endpoint('calitiki-credits', EP_ROOT | EP_PAGES);
        add_rewrite_endpoint('calitiki-creations', EP_ROOT | EP_PAGES);
        if (get_option(self::VERSION_OPTION) !== '0.7.3') {
            update_option(self::VERSION_OPTION, '0.7.3');
            flush_rewrite_rules(false);
        }
    }

    public static function maybe_send_preview_ready_email() {
        $is_ready_notification = isset($_GET['calitiki_preview_ready']);
        $is_milestone_notification = isset($_GET['calitiki_preview_event']);
        if (!$is_ready_notification && !$is_milestone_notification) {
            return;
        }
        if (strtoupper((string) $_SERVER['REQUEST_METHOD']) !== 'POST') {
            wp_send_json_error(array('error' => 'Method not allowed'), 405);
        }
        $raw_body = file_get_contents('php://input');
        $provided_signature = isset($_SERVER['HTTP_X_CALITIKI_SIGNATURE']) ? (string) $_SERVER['HTTP_X_CALITIKI_SIGNATURE'] : '';
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        $expected_signature = hash_hmac('sha256', $raw_body, $secret);
        if (!$secret || !$provided_signature || !hash_equals($expected_signature, $provided_signature)) {
            wp_send_json_error(array('error' => 'Invalid signature'), 401);
        }
        $payload = json_decode($raw_body, true);
        $customer_id = isset($payload['wooCustomerId']) ? absint($payload['wooCustomerId']) : 0;
        $project_id = isset($payload['projectId']) ? sanitize_text_field($payload['projectId']) : '';
        $generation_id = isset($payload['generationId']) ? sanitize_text_field($payload['generationId']) : '';
        $event = $is_milestone_notification && isset($payload['event']) ? sanitize_key($payload['event']) : 'preview_ready';
        $event_id = isset($payload['eventId']) ? sanitize_text_field($payload['eventId']) : $generation_id;
        $retry_available = !empty($payload['retryAvailable']);
        $ready_url = isset($payload['readyUrl']) ? esc_url_raw($payload['readyUrl']) : '';
        $user = $customer_id ? get_user_by('id', $customer_id) : false;
        if (!$user || !$project_id || !$ready_url || !$event_id || !in_array($event, array('preview_ready', 'cover_ready', 'generation_failed', 'quality_review_required'), true)) {
            wp_send_json_error(array('error' => 'Invalid notification payload'), 400);
        }
        $dedupe_key = 'calitiki_preview_' . md5($project_id . '|' . $event . '|' . $event_id);
        if (get_transient($dedupe_key)) {
            wp_send_json_success(array('sent' => true, 'duplicate' => true));
        }
        $locale = strtoupper(isset($payload['locale']) ? sanitize_text_field($payload['locale']) : 'FR');
        $title = isset($payload['title']) ? sanitize_text_field($payload['title']) : 'Calitiki';
        if ($event === 'cover_ready' && $locale === 'ES') {
            $subject = 'La portada de tu libro Calitiki está lista';
            $message = "La portada de «{$title}» está lista. Las ilustraciones interiores esperan tu aprobación.\n\nRevisar mi portada: {$ready_url}\n\nTus fotos y tu libro permanecen privados.";
        } elseif ($event === 'cover_ready' && $locale === 'EN') {
            $subject = 'Your Calitiki cover is ready to review';
            $message = "The cover of “{$title}” is ready. Interior illustrations will wait for your approval.\n\nReview my cover: {$ready_url}\n\nYour photos and book remain private.";
        } elseif ($event === 'cover_ready') {
            $subject = 'Votre couverture Calitiki est prête à être validée';
            $message = "La couverture de « {$title} » est prête. Les illustrations intérieures attendent votre validation.\n\nVérifier ma couverture : {$ready_url}\n\nVos photos et votre livre restent privés.";
        } elseif ($event === 'quality_review_required' && $locale === 'ES') {
            $subject = 'Tu libro Calitiki está guardado y en revisión';
            $message = "Todas las páginas de «{$title}» están guardadas. Calitiki ha aislado algunas ilustraciones para verificarlas sin reiniciar el libro.\n\nNo se puede comprar el libro hasta terminar esta revisión y tu crédito no se cobrará una segunda vez.\n\nVer mi creación: {$ready_url}";
        } elseif ($event === 'quality_review_required' && $locale === 'EN') {
            $subject = 'Your Calitiki book is saved and under review';
            $message = "Every page of “{$title}” is safely saved. Calitiki isolated a few illustrations for review instead of rebuilding the book.\n\nPurchase remains unavailable until the review is complete, and your credit will not be charged a second time.\n\nView my creation: {$ready_url}";
        } elseif ($event === 'quality_review_required') {
            $subject = 'Votre livre Calitiki est conservé et en vérification';
            $message = "Toutes les pages de « {$title} » sont conservées. Calitiki a isolé quelques illustrations pour les vérifier sans recommencer le livre.\n\nL’achat reste indisponible jusqu’à la fin de cette vérification et votre crédit ne sera pas débité une seconde fois.\n\nVoir ma création : {$ready_url}";
        } elseif ($event === 'generation_failed' && $locale === 'ES') {
            $subject = 'Tu creación Calitiki necesita tu atención';
            $next_step = $retry_available ? 'Puedes retomar el libro gratuitamente desde el primer paso pendiente.' : 'No se realizará ningún nuevo intento automático; Calitiki deberá intervenir.';
            $message = "No hemos podido continuar «{$title}» esta vez. Tu trabajo está guardado y no se ha utilizado ningún crédito nuevo.\n\n{$next_step}\n\nVolver a mi creación: {$ready_url}";
        } elseif ($event === 'generation_failed' && $locale === 'EN') {
            $subject = 'Your Calitiki creation needs your attention';
            $next_step = $retry_available ? 'You can resume the book for free from the first missing step.' : 'No further attempt will start automatically; Calitiki support will need to intervene.';
            $message = "We could not continue “{$title}” this time. Your work is saved and no new credit was used.\n\n{$next_step}\n\nReturn to my creation: {$ready_url}";
        } elseif ($event === 'generation_failed') {
            $subject = 'Votre création Calitiki a besoin de votre attention';
            $next_step = $retry_available ? 'Vous pouvez reprendre gratuitement le livre à la première étape manquante.' : 'Aucun nouvel essai ne sera lancé automatiquement ; Calitiki devra intervenir.';
            $message = "Nous n’avons pas pu poursuivre « {$title} » cette fois-ci. Votre travail est conservé et aucun nouveau crédit n’a été utilisé.\n\n{$next_step}\n\nRevenir à ma création : {$ready_url}";
        } elseif ($locale === 'ES') {
            $subject = 'Tu libro Calitiki está listo';
            $message = "¡Buenas noticias! La vista previa de «{$title}» está lista.\n\nAbrir mi libro: {$ready_url}\n\nTus fotos y tu libro permanecen privados.";
        } elseif ($locale === 'EN') {
            $subject = 'Your Calitiki book is ready';
            $message = "Good news! The preview of “{$title}” is ready.\n\nOpen my book: {$ready_url}\n\nYour photos and book remain private.";
        } else {
            $subject = 'Votre livre Calitiki est prêt';
            $message = "Bonne nouvelle ! L’aperçu de « {$title} » est prêt.\n\nOuvrir mon livre : {$ready_url}\n\nVos photos et votre livre restent privés.";
        }
        $sent = wp_mail($user->user_email, $subject, $message);
        if (!$sent) {
            wp_send_json_error(array('error' => 'Email delivery failed'), 502);
        }
        set_transient($dedupe_key, '1', 30 * DAY_IN_SECONDS);
        wp_send_json_success(array('sent' => true));
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

    private static function paid_book_orders($customer_id) {
        if (!function_exists('wc_get_orders')) {
            return null;
        }
        try {
            return wc_get_orders(array(
                'customer_id' => $customer_id,
                'limit' => -1,
                'orderby' => 'date',
                'order' => 'DESC',
                'status' => array('wc-processing', 'wc-completed'),
            ));
        } catch (Throwable $error) {
            return null;
        }
    }

    private static function paid_project_ids($orders) {
        $project_ids = array();
        foreach ((array) $orders as $order) {
            foreach ($order->get_items() as $item) {
                $project_id = sanitize_text_field((string) $item->get_meta('_calitiki_project_id', true));
                $product_type = sanitize_key((string) $item->get_meta('_calitiki_product_type', true));
                if ($project_id && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $project_id) && in_array($product_type, array('ebook', 'print'), true)) {
                    $project_ids[$project_id] = true;
                }
            }
        }
        $project_ids = array_keys($project_ids);
        sort($project_ids, SORT_STRING);
        return $project_ids;
    }

    private static function creation_projects_payload($customer_id, $paid_project_ids = null) {
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        if (!$generator_url || strlen($secret) < 32) {
            return new WP_Error('calitiki_creations_config', __('La bibliothèque Calitiki n’est pas encore configurée.', 'calitiki-bridge'));
        }
        $timestamp = time();
        if (!is_array($paid_project_ids)) {
            $signature = hash_hmac('sha256', 'creations|' . $customer_id . '|' . $timestamp, $secret);
            $response = wp_remote_get(add_query_arg(array('wooCustomerId' => (string) $customer_id, 'timestamp' => $timestamp), $generator_url . '/api/commerce/creations'), array(
                'timeout' => 20,
                'headers' => array('X-Calitiki-Signature' => $signature),
            ));
        } else {
        $paid_project_ids = array_values(array_unique(array_map('sanitize_text_field', (array) $paid_project_ids)));
        sort($paid_project_ids, SORT_STRING);
        $signature = hash_hmac('sha256', 'creations|' . $customer_id . '|' . $timestamp . '|' . implode(',', $paid_project_ids), $secret);
        $response = wp_remote_post($generator_url . '/api/commerce/creations', array(
            'timeout' => 20,
            'headers' => array('Content-Type' => 'application/json', 'X-Calitiki-Signature' => $signature),
            'body' => wp_json_encode(array(
                'wooCustomerId' => (string) $customer_id,
                'timestamp' => $timestamp,
                'paidProjectIds' => $paid_project_ids,
            )),
        ));
        }
        if (is_wp_error($response)) {
            return $response;
        }
        $status = wp_remote_retrieve_response_code($response);
        $payload = json_decode(wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || !is_array($payload)) {
            return new WP_Error('calitiki_creations_unavailable', __('Impossible de consulter vos créations pour le moment.', 'calitiki-bridge'));
        }
        return $payload;
    }

    private static function delete_creation_payload($customer_id, $project_id, $paid_project_ids = null) {
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        if (!$generator_url || strlen($secret) < 32) {
            return new WP_Error('calitiki_creations_config', __('La bibliothèque Calitiki n’est pas encore configurée.', 'calitiki-bridge'));
        }
        $timestamp = time();
        $request_body = array();
        if (!is_array($paid_project_ids)) {
            $signature = hash_hmac('sha256', 'delete-creation|' . $customer_id . '|' . $project_id . '|' . $timestamp, $secret);
        } else {
        $paid_project_ids = array_values(array_unique(array_map('sanitize_text_field', (array) $paid_project_ids)));
        sort($paid_project_ids, SORT_STRING);
        $signature = hash_hmac('sha256', 'delete-creation|' . $customer_id . '|' . $project_id . '|' . $timestamp . '|' . implode(',', $paid_project_ids), $secret);
            $request_body = array(
                'headers' => array('Content-Type' => 'application/json', 'X-Calitiki-Signature' => $signature),
                'body' => wp_json_encode(array('paidProjectIds' => $paid_project_ids)),
            );
        }
        $url = add_query_arg(array(
            'wooCustomerId' => (string) $customer_id,
            'timestamp' => $timestamp,
            'confirmation' => $project_id,
        ), $generator_url . '/api/commerce/creations/' . rawurlencode($project_id));
        $response = wp_remote_request($url, array_merge(array(
            'method' => 'DELETE',
            'timeout' => 30,
            'headers' => array('X-Calitiki-Signature' => $signature),
        ), $request_body));
        if (is_wp_error($response)) {
            return $response;
        }
        $status = wp_remote_retrieve_response_code($response);
        $payload = json_decode(wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || !is_array($payload)) {
            $code = sanitize_key((string) ($payload['code'] ?? 'deletion_failed'));
            $messages = array(
                'generation_active' => __('Calitiki travaille encore sur cette création. Réessayez dès que la génération est terminée ou interrompue.', 'calitiki-bridge'),
                'purchased_project' => __('Un livre acheté ne peut pas être supprimé.', 'calitiki-bridge'),
                'order_exists' => __('Cette création est liée à une commande et doit être conservée.', 'calitiki-bridge'),
                'series_canon' => __('Cette création fait partie de la continuité d’une série et doit être conservée.', 'calitiki-bridge'),
                'cleanup_pending' => __('Votre création a bien été supprimée de votre compte. La suppression sécurisée des derniers fichiers privés se poursuit automatiquement. Aucune action n’est nécessaire.', 'calitiki-bridge'),
                'invalid_confirmation' => __('La confirmation de suppression a expiré. Actualisez la page puis réessayez une seule fois.', 'calitiki-bridge'),
                'deletion_failed' => __('Calitiki n’a pas pu enregistrer cette suppression. La création reste intacte. Réessayez plus tard ou contactez Calitiki.', 'calitiki-bridge'),
            );
            return new WP_Error($code, $messages[$code] ?? __('Impossible de supprimer cette création pour le moment.', 'calitiki-bridge'));
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

    private static function fresh_ebook_delivery($order_id, $customer_id, $project_id) {
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        if (!$generator_url || strlen($secret) < 32) {
            return array();
        }
        $timestamp = time();
        $signature = hash_hmac('sha256', 'delivery-link|' . $order_id . '|' . $customer_id . '|' . $project_id . '|' . $timestamp, $secret);
        $url = add_query_arg(array('orderId' => (string) $order_id, 'wooCustomerId' => (string) $customer_id, 'projectId' => (string) $project_id, 'timestamp' => $timestamp), $generator_url . '/api/commerce/ebook-download-link');
        $response = wp_remote_get($url, array('timeout' => 20, 'headers' => array('X-Calitiki-Signature' => $signature)));
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) < 200 || wp_remote_retrieve_response_code($response) >= 300) {
            return array();
        }
        $payload = json_decode(wp_remote_retrieve_body($response), true);
        return !empty($payload['delivery']) && is_array($payload['delivery']) ? $payload['delivery'] : array();
    }

    public static function render_account_creations() {
        $customer_id = get_current_user_id();
        echo '<div class="calitiki-creations-account"><h2>' . esc_html__('Mes créations Calitiki', 'calitiki-bridge') . '</h2>';
        self::render_creation_deletion_notice($customer_id);
        self::render_ebook_resend_notice($customer_id);
        $orders = self::paid_book_orders($customer_id);
        $paid_project_id_list = is_array($orders) ? self::paid_project_ids($orders) : null;
        $project_payload = self::creation_projects_payload($customer_id, $paid_project_id_list);
        $projects = is_wp_error($project_payload) ? array() : (is_array($project_payload['projects'] ?? null) ? $project_payload['projects'] : array());
        $project_titles = array();
        foreach ($projects as $project) {
            $listed_project_id = sanitize_text_field((string) ($project['id'] ?? ''));
            $listed_project_title = sanitize_text_field((string) ($project['title'] ?? ''));
            if ($listed_project_id && $listed_project_title) {
                $project_titles[$listed_project_id] = $listed_project_title;
            }
        }
        if (is_wp_error($project_payload)) {
            wc_print_notice($project_payload->get_error_message(), 'notice');
        }
        $purchased_project_ids = array_fill_keys((array) $paid_project_id_list, true);
        $found = false;
        echo '<div class="calitiki-creation-grid">';
        foreach ($projects as $project) {
            $project_id = sanitize_text_field((string) ($project['id'] ?? ''));
            if (!$project_id || isset($purchased_project_ids[$project_id])) {
                continue;
            }
            $status = sanitize_key((string) ($project['status'] ?? ''));
            $status_labels = array(
                'scenario_generating' => __('Scénario en préparation', 'calitiki-bridge'),
                'scenario_generation_failed' => __('Préparation du scénario interrompue', 'calitiki-bridge'),
                'scenario_needs_clarification' => __('Scénario à préciser', 'calitiki-bridge'),
                'scenario_review' => __('Scénario à valider', 'calitiki-bridge'),
                'preview_generating' => __('Génération en cours', 'calitiki-bridge'),
                'preview_quality_review' => __('Illustrations en vérification', 'calitiki-bridge'),
                'preview_failed' => __('Génération interrompue', 'calitiki-bridge'),
                'preview_ready' => __('Aperçu prêt', 'calitiki-bridge'),
                'preview_repairing' => __('Correction en cours', 'calitiki-bridge'),
                'purchased' => __('Aperçu prêt', 'calitiki-bridge'),
            );
            if (!isset($status_labels[$status])) {
                continue;
            }
            $project_url = self::creator_bridge_url($project_id);
            if (!$project_url) {
                continue;
            }
            $found = true;
            $title = sanitize_text_field((string) ($project['title'] ?? 'Calitiki'));
            $pages = absint($project['pageCount'] ?? 0);
            if ($status === 'preview_quality_review') {
                $button_label = __('Voir la vérification', 'calitiki-bridge');
            } else {
                $button_label = in_array($status, array('preview_ready', 'purchased'), true)
                    ? __('Voir mon livre', 'calitiki-bridge')
                    : (in_array($status, array('preview_failed', 'scenario_generation_failed'), true)
                        ? __('Reprendre mon projet', 'calitiki-bridge')
                        : (in_array($status, array('scenario_needs_clarification', 'scenario_review'), true)
                            ? __('Vérifier le scénario', 'calitiki-bridge')
                            : __('Suivre la génération', 'calitiki-bridge')));
            }
            echo '<article class="calitiki-creation-card calitiki-preview-card"><span>' . esc_html__('Aperçu personnalisé', 'calitiki-bridge') . '</span>';
            echo '<h3>' . esc_html($title ?: 'Calitiki') . '</h3><p>' . esc_html($pages ? sprintf(__('%1$s · %2$d pages', 'calitiki-bridge'), $status_labels[$status], $pages) : $status_labels[$status]) . '</p>';
            echo '<a class="button alt" href="' . esc_url($project_url) . '">' . esc_html($button_label) . '</a>';
            if (!empty($project['deletable'])) {
                $warning = __('Supprimer définitivement cette création ? Les photos et fichiers privés qui ne sont utilisés par aucun autre livre seront effacés. Le crédit déjà utilisé et la remise liée à ce livre ne pourront pas être récupérés.', 'calitiki-bridge');
                echo '<form class="calitiki-delete-creation" method="post" action="' . esc_url(admin_url('admin-post.php')) . '" data-confirm="' . esc_attr($warning) . '">';
                echo '<input type="hidden" name="action" value="calitiki_delete_creation">';
                echo '<input type="hidden" name="project_id" value="' . esc_attr($project_id) . '">';
                wp_nonce_field('calitiki_delete_creation_' . $project_id);
                echo '<button class="button calitiki-delete-button" type="submit">' . esc_html__('Supprimer définitivement', 'calitiki-bridge') . '</button></form>';
            }
            echo '</article>';
        }
        foreach ((array) $orders as $order) {
            foreach ($order->get_items() as $item) {
                $project_id = (string) $item->get_meta('_calitiki_project_id', true);
                $product_type = sanitize_key((string) $item->get_meta('_calitiki_product_type', true));
                if (!$project_id || !in_array($product_type, array('ebook', 'print'), true)) {
                    continue;
                }
                $found = true;
                $pages = absint($item->get_meta('_calitiki_page_count', true));
                $delivery = $product_type === 'ebook' ? self::fresh_ebook_delivery($order->get_id(), $customer_id, $project_id) : array();
                $download_url = esc_url_raw($delivery['downloadUrl'] ?? '');
                $delivery_layout = sanitize_key((string) ($delivery['layoutId'] ?? ''));
                $emailed_layout = sanitize_key((string) $item->get_meta('_calitiki_ebook_email_layout', true));
                if ($download_url && (!$item->get_meta('_calitiki_ebook_email_sent', true) || ($delivery_layout && $delivery_layout !== $emailed_layout))) {
                    self::send_ebook_ready_email($order, $item, $delivery);
                }
                $email_sent_at = (string) $item->get_meta('_calitiki_ebook_email_sent', true);
                echo '<article class="calitiki-creation-card"><span>' . esc_html($product_type === 'ebook' ? __('Pack numérique personnalisé', 'calitiki-bridge') : __('Livre imprimé personnalisé', 'calitiki-bridge')) . '</span>';
                $item_name = sanitize_text_field((string) ($project_titles[$project_id] ?? ''));
                if (!$item_name) {
                    $item_name = sanitize_text_field((string) $item->get_meta('_calitiki_project_title', true));
                }
                if (!$item_name) {
                    $item_name = sanitize_text_field((string) $item->get_meta(__('Création Calitiki', 'calitiki-bridge'), true));
                }
                if (!$item_name) {
                    $item_name = html_entity_decode((string) $item->get_name(), ENT_QUOTES | ENT_HTML5, get_bloginfo('charset') ?: 'UTF-8');
                }
                $item_name = trim(preg_replace('/\s+/', ' ', wp_strip_all_tags($item_name, true)));
                echo '<h3>' . esc_html($item_name) . '</h3><p>' . esc_html(sprintf(__('Commande n°%1$s · %2$d pages', 'calitiki-bridge'), $order->get_order_number(), $pages)) . '</p>';
                $reader_url = self::interactive_reader_bridge_url($project_id);
                if ($reader_url) {
                    echo '<a class="button calitiki-reader-button" href="' . esc_url($reader_url) . '">' . esc_html__('Lire mon livre interactif', 'calitiki-bridge') . '</a>';
                }
                if ($product_type === 'ebook') {
                    $next_adventure_url = self::new_adventure_bridge_url($project_id);
                    if ($next_adventure_url) {
                        echo '<a class="button calitiki-series-button" href="' . esc_url($next_adventure_url) . '">' . esc_html__('Créer une nouvelle aventure', 'calitiki-bridge') . '</a>';
                    }
                    $narration_url = self::narration_bridge_url($project_id);
                    if ($narration_url) {
                        echo '<a class="button calitiki-narration-button" href="' . esc_url($narration_url) . '">' . esc_html__('Choisir une narration IA', 'calitiki-bridge') . '</a>';
                    }
                }
                $family_share_url = ($product_type === 'ebook' && $download_url) ? self::family_share_bridge_url($project_id) : '';
                if ($family_share_url) {
                    echo '<a class="button calitiki-family-share-button" href="' . esc_url($family_share_url) . '">' . esc_html__('Partager avec la famille', 'calitiki-bridge') . '</a>';
                }
                if ($download_url) {
                    echo '<a class="button alt" href="' . esc_url($download_url) . '">' . esc_html__('Télécharger mon eBook', 'calitiki-bridge') . '</a>';
                    if ($email_sent_at) {
                        echo '<p class="calitiki-delivery-email">' . esc_html(sprintf(__('Lien eBook envoyé à %s.', 'calitiki-bridge'), $order->get_billing_email())) . '</p>';
                    } else {
                        echo '<p class="calitiki-delivery-warning">' . esc_html__('Le PDF est prêt, mais l’envoi de l’e-mail n’a pas pu être confirmé.', 'calitiki-bridge') . '</p>';
                    }
                    echo '<form class="calitiki-email-resend" method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
                    echo '<input type="hidden" name="action" value="calitiki_resend_ebook">';
                    echo '<input type="hidden" name="order_id" value="' . esc_attr($order->get_id()) . '">';
                    echo '<input type="hidden" name="item_id" value="' . esc_attr($item->get_id()) . '">';
                    wp_nonce_field('calitiki_resend_ebook_' . $order->get_id() . '_' . $item->get_id());
                    echo '<button class="button" type="submit">' . esc_html($email_sent_at ? __('Renvoyer l’e-mail', 'calitiki-bridge') : __('Envoyer par e-mail', 'calitiki-bridge')) . '</button></form>';
                } elseif ($product_type === 'ebook' && ($delivery['errorCode'] ?? '') === 'preview_assets_missing') {
                    echo '<p class="calitiki-delivery-warning">' . esc_html__('Cet ancien aperçu doit être reconstruit avant le téléchargement. Votre achat reste bien enregistré et aucun nouveau paiement ne sera demandé.', 'calitiki-bridge') . '</p>';
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
        echo '</div><style>.calitiki-creation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.calitiki-creation-card{padding:22px;border:1px solid #ead8c8;border-radius:18px;background:#fffaf4}.calitiki-creation-card>span{font-size:12px;font-weight:800;color:#c96f57;text-transform:uppercase;letter-spacing:.08em}.calitiki-creation-card h3{margin:8px 0}.calitiki-creation-card>a.button,.calitiki-creation-card .calitiki-email-resend .button,.calitiki-creation-card .calitiki-delete-button{display:block;width:100%;margin:0 0 12px;text-align:center}.calitiki-delete-creation{margin-top:4px}.calitiki-creation-card .calitiki-delete-button{border-color:#b54136!important;background:transparent!important;color:#8b2f28!important;box-shadow:none!important}.calitiki-creation-card .calitiki-delete-button:hover{background:#b54136!important;color:#fff!important}.calitiki-delivery-pending,.calitiki-delivery-email{color:#667a7c}.calitiki-delivery-warning{color:#934b3d;font-weight:600}.calitiki-email-resend{margin:14px 0 0}.calitiki-email-resend .button{margin-bottom:0!important}@media(max-width:700px){.calitiki-creation-grid{grid-template-columns:1fr}}</style>';
        echo '<script>document.querySelectorAll(".calitiki-delete-creation").forEach(function(form){form.addEventListener("submit",function(event){if(!window.confirm(form.getAttribute("data-confirm")||"")){event.preventDefault();}});});</script></div>';
    }

    public static function delete_creation() {
        $redirect = function_exists('wc_get_account_endpoint_url') ? wc_get_account_endpoint_url('calitiki-creations') : home_url('/');
        $customer_id = get_current_user_id();
        $project_id = sanitize_text_field((string) ($_POST['project_id'] ?? ''));
        if (!$customer_id || !$project_id) {
            if ($customer_id) {
                self::store_creation_deletion_notice($customer_id, 'not_found');
            }
            wp_safe_redirect($redirect);
            exit;
        }
        check_admin_referer('calitiki_delete_creation_' . $project_id);
        $orders = self::paid_book_orders($customer_id);
        $result = self::delete_creation_payload($customer_id, $project_id, is_array($orders) ? self::paid_project_ids($orders) : null);
        if (is_wp_error($result)) {
            self::store_creation_deletion_notice($customer_id, $result->get_error_code());
        } elseif (!empty($result['cleanupPending'])) {
            self::store_creation_deletion_notice($customer_id, 'cleanup_pending');
        } else {
            self::store_creation_deletion_notice($customer_id, 'success');
        }
        wp_safe_redirect($redirect);
        exit;
    }

    private static function store_creation_deletion_notice($customer_id, $status) {
        set_transient('calitiki_creation_deletion_' . absint($customer_id), sanitize_key($status), 5 * MINUTE_IN_SECONDS);
    }

    private static function render_creation_deletion_notice($customer_id) {
        $key = 'calitiki_creation_deletion_' . absint($customer_id);
        $status = sanitize_key((string) get_transient($key));
        if (!$status) {
            return;
        }
        delete_transient($key);
        $notices = array(
            'success' => array('success', __('La création et ses fichiers privés propres ont été supprimés définitivement.', 'calitiki-bridge')),
            'not_found' => array('error', __('Création introuvable.', 'calitiki-bridge')),
            'generation_active' => array('error', __('Calitiki travaille encore sur cette création. Réessayez dès que la génération est terminée ou interrompue.', 'calitiki-bridge')),
            'purchased_project' => array('error', __('Un livre acheté ne peut pas être supprimé.', 'calitiki-bridge')),
            'order_exists' => array('error', __('Cette création est liée à une commande et doit être conservée.', 'calitiki-bridge')),
            'series_canon' => array('error', __('Cette création fait partie de la continuité d’une série et doit être conservée.', 'calitiki-bridge')),
            'cleanup_pending' => array('notice', __('Votre création a bien été supprimée de votre compte. La suppression sécurisée des derniers fichiers privés se poursuit automatiquement. Aucune action n’est nécessaire.', 'calitiki-bridge')),
            'invalid_confirmation' => array('error', __('La confirmation de suppression a expiré. Actualisez la page puis réessayez une seule fois.', 'calitiki-bridge')),
            'deletion_failed' => array('error', __('Calitiki n’a pas pu enregistrer cette suppression. La création reste intacte. Réessayez plus tard ou contactez Calitiki.', 'calitiki-bridge')),
            'http_request_failed' => array('error', __('La connexion sécurisée avec Calitiki n’a pas abouti. La création reste intacte. Réessayez dans quelques instants.', 'calitiki-bridge')),
            'calitiki_creations_config' => array('error', __('La connexion Calitiki doit être vérifiée par l’administrateur. La création reste intacte.', 'calitiki-bridge')),
        );
        $notice = isset($notices[$status])
            ? $notices[$status]
            : array('error', __('Impossible de supprimer cette création pour le moment.', 'calitiki-bridge'));
        $class = $notice[0] === 'success' ? 'woocommerce-message' : ($notice[0] === 'notice' ? 'woocommerce-info' : 'woocommerce-error');
        echo '<div class="' . esc_attr($class) . '" role="alert">' . esc_html($notice[1]) . '</div>';
    }

    public static function resend_ebook_email() {
        $redirect = function_exists('wc_get_account_endpoint_url') ? wc_get_account_endpoint_url('calitiki-creations') : home_url('/');
        $customer_id = get_current_user_id();
        $order_id = absint($_POST['order_id'] ?? 0);
        $item_id = absint($_POST['item_id'] ?? 0);
        if (!$customer_id || !$order_id || !$item_id) {
            if ($customer_id) {
                self::store_ebook_resend_notice($customer_id, 'not_found');
            }
            wp_safe_redirect($redirect);
            exit;
        }
        check_admin_referer('calitiki_resend_ebook_' . $order_id . '_' . $item_id);
        try {
            $order = function_exists('wc_get_order') ? wc_get_order($order_id) : null;
            $item = $order ? $order->get_item($item_id) : null;
            if (!$order || (int) $order->get_customer_id() !== (int) $customer_id || !$item) {
                self::store_ebook_resend_notice($customer_id, 'not_found');
                wp_safe_redirect($redirect);
                exit;
            }
            $project_id = (string) $item->get_meta('_calitiki_project_id', true);
            $product_type = sanitize_key((string) $item->get_meta('_calitiki_product_type', true));
            $delivery = $project_id && $product_type === 'ebook' ? self::fresh_ebook_delivery($order_id, $customer_id, $project_id) : array();
            if (empty($delivery['downloadUrl'])) {
                self::store_ebook_resend_notice($customer_id, 'pending');
            } elseif (self::send_ebook_ready_email($order, $item, $delivery, true)) {
                self::store_ebook_resend_notice($customer_id, 'sent');
            } else {
                self::store_ebook_resend_notice($customer_id, 'error');
            }
        } catch (Throwable $error) {
            self::log_ebook_email_error($error, $order_id);
            self::store_ebook_resend_notice($customer_id, 'error');
        }
        wp_safe_redirect($redirect);
        exit;
    }

    private static function store_ebook_resend_notice($customer_id, $status) {
        set_transient('calitiki_ebook_resend_' . absint($customer_id), sanitize_key($status), 5 * MINUTE_IN_SECONDS);
    }

    private static function render_ebook_resend_notice($customer_id) {
        $key = 'calitiki_ebook_resend_' . absint($customer_id);
        $status = sanitize_key((string) get_transient($key));
        if (!$status) {
            return;
        }
        delete_transient($key);
        $notices = array(
            'sent' => array('success', __('L’e-mail contenant votre eBook a bien été envoyé.', 'calitiki-bridge')),
            'pending' => array('notice', __('Votre eBook est encore en préparation. Réessayez dans quelques instants.', 'calitiki-bridge')),
            'not_found' => array('error', __('Impossible de retrouver cet eBook dans votre compte.', 'calitiki-bridge')),
            'error' => array('error', __('WordPress n’a pas pu envoyer l’e-mail. Vérifiez la configuration SMTP du site.', 'calitiki-bridge')),
        );
        if (!isset($notices[$status])) {
            return;
        }
        $class = $notices[$status][0] === 'success' ? 'woocommerce-message' : ($notices[$status][0] === 'notice' ? 'woocommerce-info' : 'woocommerce-error');
        echo '<div class="' . esc_attr($class) . '" role="alert">' . esc_html($notices[$status][1]) . '</div>';
    }

    private static function log_ebook_email_error($error, $order_id) {
        if (!function_exists('wc_get_logger')) {
            return;
        }
        wc_get_logger()->error(
            'Impossible d’envoyer l’e-mail eBook : ' . sanitize_text_field($error->getMessage()),
            array('source' => 'calitiki-bridge', 'order_id' => absint($order_id))
        );
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
            $print_book_enabled = !empty($_POST['calitiki_print_book_enabled']) ? 'yes' : 'no';
            if ($generator_url) {
                update_option(self::GENERATOR_URL_OPTION, untrailingslashit($generator_url));
            }
            if (!empty($_POST['calitiki_regenerate_secret'])) {
                $secret = wp_generate_password(64, false, false);
            }
            if (strlen($secret) >= 32) {
                update_option(self::SHARED_SECRET_OPTION, $secret);
            }
            update_option(self::PRINT_BOOK_ENABLED_OPTION, $print_book_enabled);
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Réglages enregistrés.', 'calitiki-bridge') . '</p></div>';
        }

        $generator_url = get_option(self::GENERATOR_URL_OPTION, 'https://storybook-mcp.onrender.com');
        $secret = get_option(self::SHARED_SECRET_OPTION, '');
        $print_book_enabled = self::print_book_enabled();
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
                    <tr>
                        <th scope="row">Livre imprimé</th>
                        <td>
                            <label><input type="checkbox" name="calitiki_print_book_enabled" value="1" <?php checked($print_book_enabled); ?> /> Activer la vente et la personnalisation du livre imprimé</label>
                            <p class="description">Laissez cette option décochée tant que le fournisseur d’impression n’est pas prêt. Le produit reste visible dans la boutique avec la mention « Prochainement disponible », mais il ne peut pas être acheté.</p>
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

    private static function creator_bridge_url($project_id) {
        $project_id = sanitize_text_field((string) $project_id);
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        if (!$project_id || strlen($secret) < 32 || !$generator_url) {
            return '';
        }
        $payload = self::base64url_encode(wp_json_encode(array(
            'type' => 'woocommerce_auth',
            'projectId' => $project_id,
            'destination' => 'creator',
            'nonce' => wp_generate_password(24, false, false),
            'exp' => time() + 10 * MINUTE_IN_SECONDS,
        )));
        $signature = self::base64url_encode(hash_hmac('sha256', $payload, $secret, true));
        return add_query_arg(array('calitiki_connect' => '1', 'state' => $payload . '.' . $signature), home_url('/'));
    }

    private static function credit_return_bridge_url($project_id, $context = 'preview', $status = 'back') {
        $project_id = sanitize_text_field((string) $project_id);
        $contexts = array('preview', 'action_center', 'modification');
        $statuses = array('paid', 'syncing', 'pending', 'failed', 'cancelled', 'back');
        $context = in_array($context, $contexts, true) ? $context : 'preview';
        $status = in_array($status, $statuses, true) ? $status : 'back';
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        if (!$project_id || !preg_match('/^[A-Za-z0-9_-]{6,128}$/', $project_id) || strlen($secret) < 32 || !$generator_url) {
            return '';
        }
        $payload = self::base64url_encode(wp_json_encode(array(
            'type' => 'woocommerce_auth',
            'projectId' => $project_id,
            'destination' => 'credit_return',
            'creditContext' => $context,
            'creditStatus' => $status,
            'nonce' => wp_generate_password(24, false, false),
            'exp' => time() + HOUR_IN_SECONDS,
        )));
        $signature = self::base64url_encode(hash_hmac('sha256', $payload, $secret, true));
        return add_query_arg(array('calitiki_connect' => '1', 'state' => $payload . '.' . $signature), home_url('/'));
    }

    private static function interactive_reader_bridge_url($project_id) {
        $project_id = sanitize_text_field((string) $project_id);
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        if (!$project_id || strlen($secret) < 32 || !$generator_url) {
            return '';
        }
        $payload = self::base64url_encode(wp_json_encode(array(
            'type' => 'woocommerce_auth',
            'projectId' => $project_id,
            'destination' => 'interactive_reader',
            'nonce' => wp_generate_password(24, false, false),
            'exp' => time() + 10 * MINUTE_IN_SECONDS,
        )));
        $signature = self::base64url_encode(hash_hmac('sha256', $payload, $secret, true));
        return add_query_arg(array(
            'calitiki_connect' => '1',
            'state' => $payload . '.' . $signature,
        ), home_url('/'));
    }

    private static function family_share_bridge_url($project_id) {
        $project_id = sanitize_text_field((string) $project_id);
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        if (!$project_id || strlen($secret) < 32 || !$generator_url) {
            return '';
        }
        $payload = self::base64url_encode(wp_json_encode(array(
            'type' => 'woocommerce_auth',
            'projectId' => $project_id,
            'destination' => 'family_share',
            'nonce' => wp_generate_password(24, false, false),
            'exp' => time() + 10 * MINUTE_IN_SECONDS,
        )));
        $signature = self::base64url_encode(hash_hmac('sha256', $payload, $secret, true));
        return add_query_arg(array(
            'calitiki_connect' => '1',
            'state' => $payload . '.' . $signature,
        ), home_url('/'));
    }

    private static function narration_bridge_url($project_id) {
        $project_id = sanitize_text_field((string) $project_id);
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        if (!$project_id || strlen($secret) < 32 || !$generator_url) {
            return '';
        }
        $payload = self::base64url_encode(wp_json_encode(array(
            'type' => 'woocommerce_auth',
            'projectId' => $project_id,
            'destination' => 'narration',
            'nonce' => wp_generate_password(24, false, false),
            'exp' => time() + 10 * MINUTE_IN_SECONDS,
        )));
        $signature = self::base64url_encode(hash_hmac('sha256', $payload, $secret, true));
        return add_query_arg(array('calitiki_connect' => '1', 'state' => $payload . '.' . $signature), home_url('/'));
    }

    private static function new_adventure_bridge_url($project_id) {
        $project_id = sanitize_text_field((string) $project_id);
        $secret = (string) get_option(self::SHARED_SECRET_OPTION, '');
        $generator_url = untrailingslashit((string) get_option(self::GENERATOR_URL_OPTION, ''));
        if (!$project_id || strlen($secret) < 32 || !$generator_url) {
            return '';
        }
        $payload = self::base64url_encode(wp_json_encode(array(
            'type' => 'woocommerce_auth',
            'projectId' => $project_id,
            'destination' => 'new_adventure',
            'nonce' => wp_generate_password(24, false, false),
            'exp' => time() + 10 * MINUTE_IN_SECONDS,
        )));
        $signature = self::base64url_encode(hash_hmac('sha256', $payload, $secret, true));
        return add_query_arg(array('calitiki_connect' => '1', 'state' => $payload . '.' . $signature), home_url('/'));
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
        if ($slug === self::NARRATION_SLUG || $product->get_sku() === 'CAL-NARRATION') {
            return 'narration';
        }
        return '';
    }

    private static function print_book_enabled() {
        return get_option(self::PRINT_BOOK_ENABLED_OPTION, 'no') === 'yes';
    }

    public static function product_is_purchasable($purchasable, $product) {
        return self::personalized_format($product) === 'print' && !self::print_book_enabled() ? false : $purchasable;
    }

    public static function catalog_product_badge() {
        global $product;
        $format = self::personalized_format($product);
        if ($format === 'ebook') {
            echo '<span class="calitiki-product-badge calitiki-digital-pack-badge">' . esc_html__('eBook + livre interactif inclus', 'calitiki-bridge') . '</span>';
        } elseif ($format === 'narration') {
            echo '<span class="calitiki-product-badge calitiki-narration-badge">' . esc_html__('Option audio générée après paiement', 'calitiki-bridge') . '</span>';
        } elseif ($format === 'print' && !self::print_book_enabled()) {
            echo '<span class="calitiki-product-badge calitiki-coming-soon-badge">' . esc_html__('Prochainement disponible', 'calitiki-bridge') . '</span>';
        }
    }

    private static function product_for_format($format) {
        $slug = $format === 'ebook' ? self::EBOOK_SLUG : ($format === 'narration' ? self::NARRATION_SLUG : self::PRINT_SLUG);
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
        if ($format === 'print' && !self::print_book_enabled()) {
            echo '<div class="calitiki-personalize-cta calitiki-coming-soon-notice">';
            echo '<strong>' . esc_html__('Prochainement disponible', 'calitiki-bridge') . '</strong>';
            echo '<p>' . esc_html__('Nous finalisons notre service d’impression et de livraison. Ce produit ne peut pas encore être personnalisé ni commandé.', 'calitiki-bridge') . '</p>';
            echo '<span class="button disabled" aria-disabled="true">' . esc_html__('Bientôt disponible', 'calitiki-bridge') . '</span>';
            echo '</div>';
            return;
        }
        if ($format === 'narration') {
            echo '<div class="calitiki-personalize-cta"><p>' . esc_html__('La narration IA est créée pour un eBook Calitiki déjà acheté. Choisissez la voix et le style depuis Mes créations Calitiki.', 'calitiki-bridge') . '</p>';
            echo '<a class="button alt" href="' . esc_url(wc_get_account_endpoint_url('calitiki-creations')) . '">' . esc_html__('Ouvrir mes créations', 'calitiki-bridge') . ' &rarr;</a></div>';
            return;
        }
        $label = $format === 'ebook' ? __('Personnaliser mon pack numérique', 'calitiki-bridge') : __('Personnaliser votre livre imprimé', 'calitiki-bridge');
        echo '<div class="calitiki-personalize-cta">';
        echo '<p>' . esc_html($format === 'ebook' ? __('Le pack numérique comprend le PDF à télécharger et le livre interactif à lire en ligne. Personnalisez et prévisualisez votre histoire avant de l’ajouter au panier.', 'calitiki-bridge') : __('Ce livre est créé sur mesure. Personnalisez et prévisualisez votre histoire avant de l’ajouter au panier.', 'calitiki-bridge')) . '</p>';
        echo '<a class="button alt" href="' . esc_url(self::generator_personalize_url($format)) . '">' . esc_html($label) . ' &rarr;</a>';
        echo '</div>';
    }

    public static function personalized_loop_link($html, $product, $args) {
        $format = self::personalized_format($product);
        if (!$format) {
            return $html;
        }
        if ($format === 'print' && !self::print_book_enabled()) {
            return '<span class="button disabled calitiki-coming-soon-button" aria-disabled="true">' . esc_html__('Prochainement disponible', 'calitiki-bridge') . '</span>';
        }
        if ($format === 'narration') {
            return '<a href="' . esc_url(wc_get_account_endpoint_url('calitiki-creations')) . '" class="button">' . esc_html__('Choisir depuis mes créations', 'calitiki-bridge') . '</a>';
        }
        return sprintf('<a href="%s" class="button product_type_variable">%s</a>', esc_url(get_permalink($product->get_id())), esc_html__('Découvrir et personnaliser', 'calitiki-bridge'));
    }

    public static function validate_personalized_add_to_cart($passed, $product_id, $quantity, $variation_id = 0, $variations = array(), $cart_item_data = array()) {
        $format = self::personalized_format($variation_id ?: $product_id);
        if (!$format) {
            return $passed;
        }
        if ($format === 'print' && !self::print_book_enabled()) {
            wc_add_notice(__('Le livre imprimé sera prochainement disponible. Il ne peut pas encore être ajouté au panier.', 'calitiki-bridge'), 'notice');
            return false;
        }
        if (!empty($cart_item_data['_calitiki_authorized']) && !empty($cart_item_data['calitiki_project_id'])) {
            return $passed;
        }
        wc_add_notice($format === 'narration'
            ? __('Choisissez la voix et le style de narration depuis Mes créations Calitiki avant de l’ajouter au panier.', 'calitiki-bridge')
            : __('Personnalisez d’abord votre livre et générez son aperçu avant de l’ajouter au panier.', 'calitiki-bridge'), 'notice');
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
        if (!in_array($format, array('ebook', 'print', 'narration'), true) || !in_array($pages, array(24, 28, 32, 36, 40, 44), true) || !$project_id) {
            wp_die(esc_html__('La configuration du livre est invalide.', 'calitiki-bridge'), 'Calitiki', array('response' => 400));
        }
        if ($format === 'print' && !self::print_book_enabled()) {
            wp_die(esc_html__('Le livre imprimé sera prochainement disponible. Aucun achat ne peut encore être créé pour ce format.', 'calitiki-bridge'), 'Calitiki', array('response' => 409));
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
        $narration_voice = sanitize_key($payload['narrationVoiceId'] ?? '');
        $narration_style = sanitize_key($payload['narrationStyleId'] ?? '');
        if ($format === 'narration' && (!$narration_voice || !$narration_style)) {
            wp_die(esc_html__('La voix ou le style de narration est manquant.', 'calitiki-bridge'), 'Calitiki', array('response' => 400));
        }
        $cart_data = array(
            '_calitiki_authorized' => true,
            'calitiki_project_id' => $project_id,
            'calitiki_project_title' => sanitize_text_field($payload['projectTitle'] ?? __('Livre personnalisé', 'calitiki-bridge')),
            'calitiki_product_type' => $format,
            'calitiki_page_count' => $pages,
            'calitiki_rebate_cents' => $format === 'narration' ? 0 : max(0, absint($payload['rebateCents'] ?? 0)),
            'calitiki_reservation_id' => $format === 'narration' ? '' : sanitize_text_field($payload['reservationId'] ?? ''),
            'calitiki_narration_voice' => $narration_voice,
            'calitiki_narration_style' => $narration_style,
            'calitiki_base_price_cents' => $base_price_cents,
            'unique_key' => md5($project_id . '|' . $format . '|' . $narration_voice . '|' . $narration_style),
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
            if (($cart_item['calitiki_product_type'] ?? '') === 'narration') {
                continue;
            }
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
        if (($cart_item['calitiki_product_type'] ?? '') === 'narration') {
            $data[] = array('key' => __('Voix IA', 'calitiki-bridge'), 'value' => sanitize_text_field($cart_item['calitiki_narration_voice'] ?? ''));
            $data[] = array('key' => __('Style de narration', 'calitiki-bridge'), 'value' => sanitize_text_field($cart_item['calitiki_narration_style'] ?? ''));
            $data[] = array('key' => __('Option audio', 'calitiki-bridge'), 'value' => __('Générée après paiement · non déduite des crédits d’aperçu', 'calitiki-bridge'));
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
        $item->add_meta_data('_calitiki_narration_voice', sanitize_key($values['calitiki_narration_voice'] ?? ''), true);
        $item->add_meta_data('_calitiki_narration_style', sanitize_key($values['calitiki_narration_style'] ?? ''), true);
        $item->add_meta_data('_calitiki_project_title', sanitize_text_field($values['calitiki_project_title'] ?? ''), true);
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

    private static function send_ebook_ready_email($order, $item, $delivery, $force = false) {
        $delivery_layout = sanitize_key((string) ($delivery['layoutId'] ?? ''));
        $emailed_layout = sanitize_key((string) $item->get_meta('_calitiki_ebook_email_layout', true));
        if (!$force && $item->get_meta('_calitiki_ebook_email_sent', true) && (!$delivery_layout || $delivery_layout === $emailed_layout)) {
            return true;
        }
        $download_url = esc_url_raw($delivery['downloadUrl'] ?? '');
        $recipient = sanitize_email((string) $order->get_billing_email());
        if (!$download_url || !is_email($recipient) || !function_exists('WC')) {
            return false;
        }
        $sent = false;
        try {
            $copy = self::ebook_email_copy($order);
            $mailer = WC()->mailer();
            if (!is_object($mailer) || !is_callable(array($mailer, 'wrap_message')) || !is_callable(array($mailer, 'send'))) {
                throw new RuntimeException('Le moteur d’e-mail WooCommerce est indisponible.');
            }
            $content = '<p>' . esc_html($copy['intro']) . '</p><p style="margin:28px 0"><a href="' . esc_url($download_url) . '" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#d8755b;color:#fff;text-decoration:none;font-weight:700">' . esc_html($copy['button']) . '</a></p><p>' . esc_html($copy['expiry']) . '</p>';
            $message = $mailer->wrap_message($copy['heading'], $content);
            $sent = $mailer->send($recipient, $copy['subject'], $message, "Content-Type: text/html\r\n", array());
        } catch (Throwable $error) {
            self::log_ebook_email_error($error, $order->get_id());
        }
        if ($sent) {
            $item->update_meta_data('_calitiki_ebook_ready', gmdate('c'));
            $item->update_meta_data('_calitiki_ebook_email_sent', gmdate('c'));
            $item->update_meta_data('_calitiki_ebook_download_expires', sanitize_text_field($delivery['expiresAt'] ?? ''));
            $item->update_meta_data('_calitiki_ebook_email_layout', $delivery_layout);
            $item->delete_meta_data('_calitiki_ebook_email_error');
            $item->save();
        } else {
            $item->update_meta_data('_calitiki_ebook_email_error', gmdate('c'));
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
            if (!in_array($product_type, array('ebook', 'print', 'narration'), true) || !$page_count) {
                continue;
            }
            $narration_voice = sanitize_key((string) $item->get_meta('_calitiki_narration_voice', true));
            $narration_style = sanitize_key((string) $item->get_meta('_calitiki_narration_style', true));
            $marker = '_calitiki_book_' . $status . '_' . md5($project_id . '|' . $reservation_id . '|' . $product_type . '|' . $narration_voice . '|' . $narration_style);
            if ($order->get_meta($marker)) {
                continue;
            }
            $customer_id = (string) $order->get_customer_id();
            $signature_value = implode('|', array((string) $order_id, $customer_id, $project_id, $reservation_id, $product_type, (string) $page_count, (string) $order_total_cents, $status, $narration_voice, $narration_style));
            $signature = hash_hmac('sha256', $signature_value, $secret);
            $response = wp_remote_post($generator_url . '/api/commerce/book-order-status', array(
                'timeout' => 60,
                'headers' => array('Content-Type' => 'application/json', 'X-Calitiki-Signature' => $signature),
                'body' => wp_json_encode(array('orderId' => (string) $order_id, 'wooCustomerId' => $customer_id, 'email' => $order->get_billing_email(), 'projectId' => $project_id, 'reservationId' => $reservation_id, 'productType' => $product_type, 'pageCount' => $page_count, 'orderTotalCents' => $order_total_cents, 'status' => $status, 'narrationVoiceId' => $narration_voice, 'narrationStyleId' => $narration_style)),
            ));
            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) >= 200 && wp_remote_retrieve_response_code($response) < 300) {
                $payload = json_decode(wp_remote_retrieve_body($response), true);
                $delivery = is_array($payload) && !empty($payload['fulfillment']) ? $payload['fulfillment'] : array();
                $rebuild_required = $status === 'paid' && $product_type === 'ebook' && (($delivery['errorCode'] ?? '') === 'preview_assets_missing');
                $email_ready = $status !== 'paid' || $product_type !== 'ebook' || (($delivery['status'] ?? '') === 'ready' && self::send_ebook_ready_email($order, $item, $delivery));
                if ($rebuild_required) {
                    $item->update_meta_data('_calitiki_ebook_rebuild_required', gmdate('c'));
                    $item->save();
                    $order->update_meta_data($marker, gmdate('c'));
                } elseif ($email_ready) {
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

    private static function sanitize_credit_return($value) {
        $project_id = sanitize_text_field((string) ($value['projectId'] ?? $value['project'] ?? ''));
        $context = sanitize_key((string) ($value['context'] ?? 'preview'));
        if (!$project_id || !preg_match('/^[A-Za-z0-9_-]{6,128}$/', $project_id)) {
            return array();
        }
        if (!in_array($context, array('preview', 'action_center', 'modification'), true)) {
            $context = 'preview';
        }
        return array('projectId' => $project_id, 'context' => $context);
    }

    public static function capture_credit_return() {
        if (!isset($_GET['calitiki_project']) || !function_exists('WC') || !WC()->session) {
            return;
        }
        $return = self::sanitize_credit_return(array(
            'project' => wp_unslash($_GET['calitiki_project']),
            'context' => isset($_GET['calitiki_context']) ? wp_unslash($_GET['calitiki_context']) : 'preview',
        ));
        if ($return) {
            $return['createdAt'] = time();
            WC()->session->set('calitiki_credit_return', $return);
        }
    }

    private static function credit_product_amount($product_id, $variation_id = 0) {
        if (!function_exists('wc_get_product')) {
            return 0;
        }
        $product = wc_get_product($variation_id ?: $product_id);
        $amount = $product ? absint($product->get_meta('_calitiki_credit_cents', true)) : 0;
        if (!$amount && $variation_id) {
            $parent = wc_get_product($product_id);
            $amount = $parent ? absint($parent->get_meta('_calitiki_credit_cents', true)) : 0;
        }
        return $amount;
    }

    private static function current_credit_return() {
        if (!function_exists('WC') || !WC()->session) {
            return array();
        }
        $stored = (array) WC()->session->get('calitiki_credit_return', array());
        $created_at = absint($stored['createdAt'] ?? 0);
        if (!$created_at || time() - $created_at > DAY_IN_SECONDS) {
            WC()->session->__unset('calitiki_credit_return');
            return array();
        }
        return self::sanitize_credit_return($stored);
    }

    public static function credit_return_cart_item_data($cart_item_data, $product_id, $variation_id) {
        if (self::credit_product_amount($product_id, $variation_id) < 50) {
            return $cart_item_data;
        }
        $return = self::current_credit_return();
        if ($return) {
            $cart_item_data['calitiki_credit_return_project'] = $return['projectId'];
            $cart_item_data['calitiki_credit_return_context'] = $return['context'];
        }
        return $cart_item_data;
    }

    public static function credit_return_order_item_data($item, $cart_item_key, $values, $order) {
        $return = self::sanitize_credit_return(array(
            'projectId' => $values['calitiki_credit_return_project'] ?? '',
            'context' => $values['calitiki_credit_return_context'] ?? 'preview',
        ));
        if (!$return) {
            return;
        }
        $item->add_meta_data('_calitiki_credit_return_project', $return['projectId'], true);
        $item->add_meta_data('_calitiki_credit_return_context', $return['context'], true);
    }

    private static function cart_credit_return() {
        if (function_exists('WC') && WC()->cart) {
            foreach (WC()->cart->get_cart() as $cart_item) {
                $return = self::sanitize_credit_return(array(
                    'projectId' => $cart_item['calitiki_credit_return_project'] ?? '',
                    'context' => $cart_item['calitiki_credit_return_context'] ?? 'preview',
                ));
                if ($return) {
                    return $return;
                }
            }
        }
        return self::current_credit_return();
    }

    private static function order_credit_return($order) {
        if (!$order) {
            return array();
        }
        foreach ($order->get_items() as $item) {
            $return = self::sanitize_credit_return(array(
                'projectId' => $item->get_meta('_calitiki_credit_return_project', true),
                'context' => $item->get_meta('_calitiki_credit_return_context', true),
            ));
            if ($return) {
                return $return;
            }
        }
        return array();
    }

    public static function render_credit_return_navigation() {
        $return = self::cart_credit_return();
        if (!$return) {
            return;
        }
        if (function_exists('is_product') && is_product()) {
            global $product;
            if (!$product || self::credit_product_amount($product->get_id(), 0) < 50) {
                return;
            }
        }
        $return_url = self::credit_return_bridge_url($return['projectId'], $return['context'], 'back');
        if (!$return_url) {
            return;
        }
        echo '<aside class="woocommerce-info calitiki-credit-return" role="status">';
        echo '<span>' . esc_html__('Votre livre reste bien conservé pendant l’achat des crédits.', 'calitiki-bridge') . '</span> ';
        echo '<a class="button" href="' . esc_url($return_url) . '">' . esc_html__('Revenir à mon livre', 'calitiki-bridge') . '</a>';
        echo '</aside>';
    }

    public static function render_credit_return_after_order($order_id) {
        if (!function_exists('wc_get_order')) {
            return;
        }
        $order = wc_get_order($order_id);
        $return = self::order_credit_return($order);
        if (!$return) {
            return;
        }
        if ($order->get_meta('_calitiki_credit_granted')) {
            $status = 'paid';
            $message = __('Vos crédits Calitiki sont disponibles. Revenez à votre livre pour continuer.', 'calitiki-bridge');
        } elseif ($order->has_status(array('processing', 'completed'))) {
            $status = 'syncing';
            $message = __('Votre paiement est reçu. Les crédits sont en cours d’ajout à votre solde.', 'calitiki-bridge');
        } elseif ($order->has_status(array('failed', 'cancelled'))) {
            $status = $order->has_status('cancelled') ? 'cancelled' : 'failed';
            $message = __('Le paiement n’a pas abouti, mais votre livre reste bien conservé.', 'calitiki-bridge');
        } else {
            $status = 'pending';
            $message = __('Votre paiement est encore en attente. Votre livre reste bien conservé.', 'calitiki-bridge');
        }
        $return_url = self::credit_return_bridge_url($return['projectId'], $return['context'], $status);
        if (!$return_url) {
            return;
        }
        if (function_exists('WC') && WC()->session) {
            WC()->session->__unset('calitiki_credit_return');
        }
        echo '<section class="woocommerce-order-details calitiki-credit-return-after-order">';
        echo '<h2>' . esc_html__('Reprendre la création de votre livre', 'calitiki-bridge') . '</h2>';
        echo '<p>' . esc_html($message) . '</p>';
        echo '<p><a class="button alt" href="' . esc_url($return_url) . '">' . esc_html__('Revenir à mon livre', 'calitiki-bridge') . '</a></p>';
        echo '</section>';
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
