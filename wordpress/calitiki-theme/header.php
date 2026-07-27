<!doctype html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link" href="#contenu"><?php esc_html_e('Aller au contenu', 'calitiki'); ?></a>
<header class="site-header">
    <div class="site-header__inner shell">
        <?php if (has_custom_logo()) : ?>
            <div class="brand brand-with-logo"><?php the_custom_logo(); ?></div>
        <?php else : ?>
            <a class="brand" href="<?php echo esc_url(home_url('/')); ?>" aria-label="<?php esc_attr_e('Accueil Calitiki', 'calitiki'); ?>">
                <span class="brand-mark" aria-hidden="true">✦</span>
                <span><strong>Calitiki</strong><small><?php esc_html_e('Une histoire pour lui parler autrement', 'calitiki'); ?></small></span>
            </a>
        <?php endif; ?>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-navigation"><span></span><span></span><span></span><span class="screen-reader-text"><?php esc_html_e('Ouvrir le menu', 'calitiki'); ?></span></button>
        <nav class="site-navigation" id="site-navigation" aria-label="<?php esc_attr_e('Navigation principale', 'calitiki'); ?>">
            <?php wp_nav_menu(array('theme_location' => 'primary', 'container' => false, 'menu_class' => 'site-menu', 'fallback_cb' => 'calitiki_menu_fallback')); ?>
            <div class="header-actions">
                <?php calitiki_language_switcher(); ?>
                <?php if (function_exists('wc_get_page_permalink')) : ?>
                    <a class="account-link account-link-creations" href="<?php echo esc_url(calitiki_creations_url()); ?>"><?php esc_html_e('Mes créations', 'calitiki'); ?></a>
                    <a class="cart-link" href="<?php echo esc_url(wc_get_cart_url()); ?>" aria-label="<?php esc_attr_e('Voir le panier', 'calitiki'); ?>">♡<span class="cart-count"><?php echo esc_html(function_exists('WC') && WC()->cart ? WC()->cart->get_cart_contents_count() : 0); ?></span></a>
                <?php endif; ?>
                <a class="button button-small" href="<?php echo calitiki_generator_url(); ?>"><?php esc_html_e('Créer mon livre', 'calitiki'); ?></a>
            </div>
        </nav>
    </div>
</header>
<main id="contenu" class="site-main">
