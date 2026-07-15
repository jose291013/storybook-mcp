<?php
if (!defined('ABSPATH')) {
    exit;
}

define('CALITIKI_THEME_VERSION', '1.0.0');

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
    return esc_url(get_theme_mod('calitiki_generator_url', 'https://storybook-mcp.onrender.com'));
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
}
add_action('customize_register', 'calitiki_customize_register');

function calitiki_menu_fallback() {
    echo '<ul class="site-menu">';
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

