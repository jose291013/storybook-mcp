</main>
<footer class="site-footer">
    <div class="shell footer-grid">
        <div>
            <a class="brand brand-footer" href="<?php echo esc_url(home_url('/')); ?>"><span class="brand-mark" aria-hidden="true">✦</span><span><strong>Calitiki</strong><small><?php esc_html_e('Un livre rien que pour lui ou elle', 'calitiki'); ?></small></span></a>
            <p><?php esc_html_e('Des albums jeunesse personnalisés, imaginés avec soin à partir de vos souvenirs et de vos photos.', 'calitiki'); ?></p>
        </div>
        <div>
            <h2><?php esc_html_e('Découvrir', 'calitiki'); ?></h2>
            <?php wp_nav_menu(array('theme_location' => 'footer', 'container' => false, 'fallback_cb' => false)); ?>
            <ul class="footer-links">
                <li><a href="<?php echo esc_url(home_url('/#comment-ca-marche')); ?>"><?php esc_html_e('Comment ça marche', 'calitiki'); ?></a></li>
                <li><a href="<?php echo esc_url(calitiki_generator_url()); ?>"><?php esc_html_e('Créer un livre', 'calitiki'); ?></a></li>
            </ul>
        </div>
        <div>
            <h2><?php esc_html_e('Votre espace', 'calitiki'); ?></h2>
            <ul class="footer-links">
                <?php if (function_exists('wc_get_page_permalink')) : ?>
                    <li><a href="<?php echo esc_url(wc_get_page_permalink('myaccount')); ?>"><?php esc_html_e('Mon compte', 'calitiki'); ?></a></li>
                    <li><a href="<?php echo esc_url(wc_get_page_permalink('shop')); ?>"><?php esc_html_e('Boutique', 'calitiki'); ?></a></li>
                <?php endif; ?>
                <li><a href="<?php echo esc_url(home_url('/contact')); ?>"><?php esc_html_e('Nous contacter', 'calitiki'); ?></a></li>
            </ul>
        </div>
        <div class="footer-trust">
            <h2><?php esc_html_e('Conçu avec attention', 'calitiki'); ?></h2>
            <p><?php esc_html_e('Aperçu avant achat · Paiement sécurisé · Photos privées', 'calitiki'); ?></p>
        </div>
    </div>
    <div class="footer-bottom shell"><span>© <?php echo esc_html(wp_date('Y')); ?> Calitiki</span><span><?php esc_html_e('Fait pour émerveiller les petits et les grands.', 'calitiki'); ?></span></div>
</footer>
<?php wp_footer(); ?>
</body>
</html>

