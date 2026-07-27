<?php
if (!defined('ABSPATH')) {
    exit;
}

define('CALITIKI_THEME_VERSION', '1.2.1');

function calitiki_setup() {
    load_theme_textdomain('calitiki', get_template_directory() . '/languages');
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('custom-logo', array('height' => 84, 'width' => 260, 'flex-height' => true, 'flex-width' => true));
    add_theme_support('html5', array('search-form', 'gallery', 'caption', 'style', 'script'));
    add_theme_support('woocommerce');
    add_theme_support('wc-product-gallery-zoom');
    add_theme_support('wc-product-gallery-lightbox');
    add_theme_support('wc-product-gallery-slider');
    register_nav_menus(array(
        'primary' => __('Navigation principale', 'calitiki'),
        'footer' => __('Navigation de pied de page', 'calitiki'),
    ));
}
add_action('after_setup_theme', 'calitiki_setup');

function calitiki_assets() {
    wp_enqueue_style('calitiki-theme', get_template_directory_uri() . '/assets/css/theme.css', array(), CALITIKI_THEME_VERSION);
    wp_enqueue_script('calitiki-theme', get_template_directory_uri() . '/assets/js/theme.js', array(), CALITIKI_THEME_VERSION, true);
}
add_action('wp_enqueue_scripts', 'calitiki_assets');

function calitiki_generator_url() {
    $base_url = get_theme_mod('calitiki_generator_url', 'https://storybook-mcp.onrender.com');
    return esc_url(add_query_arg(array(
        'newBook' => '1',
        'uiLanguage' => calitiki_creator_language(),
        'libraryUrl' => calitiki_creations_url(),
    ), $base_url));
}

function calitiki_creations_url() {
    if (function_exists('wc_get_account_endpoint_url')) {
        return esc_url(wc_get_account_endpoint_url('calitiki-creations'));
    }
    return esc_url(home_url('/mon-compte/calitiki-creations/'));
}

function calitiki_creator_language() {
    if (function_exists('trp_custom_language_switcher')) {
        foreach ((array) trp_custom_language_switcher() as $language) {
            if (!empty($language['current_language']) && !empty($language['language_code'])) {
                $prefix = strtoupper(substr((string) $language['language_code'], 0, 2));
                return in_array($prefix, array('FR', 'ES', 'EN'), true) ? $prefix : 'FR';
            }
        }
    }
    $prefix = strtoupper(substr((string) determine_locale(), 0, 2));
    return in_array($prefix, array('FR', 'ES', 'EN'), true) ? $prefix : 'FR';
}

function calitiki_language_switcher() {
    $language_options = array();
    if (function_exists('trp_custom_language_switcher')) {
        foreach ((array) trp_custom_language_switcher() as $language) {
            $code = strtolower(substr((string) ($language['language_code'] ?? ''), 0, 2));
            $url = (string) ($language['current_page_url'] ?? '');
            if ($code && $url) {
                $language_options[] = array('code' => $code, 'url' => esc_url_raw($url));
            }
        }
    }
    $language_options_json = esc_attr(wp_json_encode($language_options));

    if (shortcode_exists('language-switcher')) {
        echo '<div class="calitiki-translatepress-switcher" data-calitiki-language-switcher data-calitiki-language-options="' . $language_options_json . '" data-no-translation>';
        echo do_shortcode('[language-switcher]');
        echo '</div>';
        return;
    }

    if (!function_exists('trp_custom_language_switcher')) {
        return;
    }

    $languages = array_values((array) trp_custom_language_switcher());
    if (empty($languages)) {
        return;
    }
    $current = null;
    foreach ($languages as $language) {
        if (!empty($language['current_language'])) {
            $current = $language;
            break;
        }
    }
    $current = $current ?: $languages[0];
    ?>
    <details class="calitiki-language-switcher" data-calitiki-language-switcher data-calitiki-language-options="<?php echo $language_options_json; ?>" data-no-translation>
        <summary aria-label="<?php esc_attr_e('Changer de langue', 'calitiki'); ?>">
            <?php if (!empty($current['flag_link'])) : ?><img src="<?php echo esc_url($current['flag_link']); ?>" alt="" width="24" height="16" /><?php endif; ?>
            <span aria-hidden="true"><?php echo esc_html(strtoupper(substr((string) ($current['short_language_name'] ?? $current['language_code']), 0, 2))); ?></span>
            <span class="screen-reader-text"><?php echo esc_html($current['language_name'] ?? ''); ?></span>
        </summary>
        <ul>
            <?php foreach ($languages as $language) :
                $is_current = !empty($language['current_language']);
                $name = (string) ($language['language_name'] ?? $language['language_code'] ?? '');
                ?>
                <li>
                    <a href="<?php echo esc_url($language['current_page_url'] ?? home_url('/')); ?>" lang="<?php echo esc_attr(substr((string) ($language['language_code'] ?? ''), 0, 2)); ?>"<?php echo $is_current ? ' aria-current="page"' : ''; ?>>
                        <?php if (!empty($language['flag_link'])) : ?><img src="<?php echo esc_url($language['flag_link']); ?>" alt="" width="24" height="16" /><?php endif; ?>
                        <span><?php echo esc_html($name); ?></span>
                    </a>
                </li>
            <?php endforeach; ?>
        </ul>
    </details>
    <?php
}

function calitiki_product_url($format) {
    $products = array(
        'ebook' => array(
            'sku' => 'CAL-EBOOK',
            'slug' => 'livre-enfant-personnalise-ebook',
        ),
        'print' => array(
            'sku' => 'CAL-PRINT-21',
            'slug' => 'livre-enfant-personnalise-imprime',
        ),
    );

    if (!isset($products[$format])) {
        return home_url('/');
    }

    $custom_url = get_theme_mod('calitiki_' . $format . '_product_url', '');
    if ($custom_url) {
        return esc_url($custom_url);
    }

    if (function_exists('wc_get_product_id_by_sku')) {
        $product_id = wc_get_product_id_by_sku($products[$format]['sku']);
        if ($product_id) {
            return esc_url(get_permalink($product_id));
        }
    }

    $product = get_page_by_path($products[$format]['slug'], OBJECT, 'product');
    if ($product && 'publish' === $product->post_status) {
        return esc_url(get_permalink($product));
    }

    if (function_exists('wc_get_page_permalink')) {
        return esc_url(wc_get_page_permalink('shop'));
    }

    return home_url('/');
}

function calitiki_customize_register($customizer) {
    $customizer->add_section('calitiki_links', array(
        'title' => __('Liens Calitiki', 'calitiki'),
        'priority' => 30,
    ));
    $customizer->add_setting('calitiki_generator_url', array(
        'default' => 'https://storybook-mcp.onrender.com',
        'sanitize_callback' => 'esc_url_raw',
    ));
    $customizer->add_control('calitiki_generator_url', array(
        'label' => __('URL du créateur de livre', 'calitiki'),
        'section' => 'calitiki_links',
        'type' => 'url',
    ));
    $customizer->add_setting('calitiki_ebook_product_url', array(
        'default' => '',
        'sanitize_callback' => 'esc_url_raw',
    ));
    $customizer->add_control('calitiki_ebook_product_url', array(
        'label' => __('URL du produit eBook (facultatif)', 'calitiki'),
        'description' => __('Laissez vide pour détecter automatiquement le produit Calitiki.', 'calitiki'),
        'section' => 'calitiki_links',
        'type' => 'url',
    ));
    $customizer->add_setting('calitiki_print_product_url', array(
        'default' => '',
        'sanitize_callback' => 'esc_url_raw',
    ));
    $customizer->add_control('calitiki_print_product_url', array(
        'label' => __('URL du produit imprimé (facultatif)', 'calitiki'),
        'description' => __('Laissez vide pour détecter automatiquement le produit Calitiki.', 'calitiki'),
        'section' => 'calitiki_links',
        'type' => 'url',
    ));
}
add_action('customize_register', 'calitiki_customize_register');

function calitiki_menu_fallback() {
    echo '<ul class="site-menu">';
    echo '<li><a href="' . esc_url(home_url('/#exemples')) . '">' . esc_html__('Exemples', 'calitiki') . '</a></li>';
    echo '<li><a href="' . esc_url(home_url('/#comment-ca-marche')) . '">' . esc_html__('Comment ça marche', 'calitiki') . '</a></li>';
    echo '<li><a href="' . esc_url(home_url('/#formats')) . '">' . esc_html__('Formats', 'calitiki') . '</a></li>';
    if (function_exists('wc_get_page_permalink')) {
        echo '<li><a href="' . esc_url(wc_get_page_permalink('shop')) . '">' . esc_html__('Boutique', 'calitiki') . '</a></li>';
    }
    echo '</ul>';
}

function calitiki_cart_count_fragment($fragments) {
    if (!function_exists('WC')) {
        return $fragments;
    }
    ob_start();
    ?>
    <span class="cart-count" aria-label="<?php esc_attr_e('Articles dans le panier', 'calitiki'); ?>"><?php echo esc_html(WC()->cart ? WC()->cart->get_cart_contents_count() : 0); ?></span>
    <?php
    $fragments['.cart-count'] = ob_get_clean();
    return $fragments;
}
add_filter('woocommerce_add_to_cart_fragments', 'calitiki_cart_count_fragment');

function calitiki_excerpt_more() {
    return '&hellip;';
}
add_filter('excerpt_more', 'calitiki_excerpt_more');
