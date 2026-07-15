<?php get_header(); ?>

<section class="hero shell">
    <div class="hero-copy">
        <span class="eyebrow"><?php esc_html_e('Un album créé rien que pour lui ou elle', 'calitiki'); ?></span>
        <h1><?php esc_html_e('Votre enfant devient le héros de sa propre histoire.', 'calitiki'); ?></h1>
        <p><?php esc_html_e('Répondez à quelques questions, ajoutez vos photos et découvrez un livre unique qui parle de ses rêves, de ses qualités et de ceux qu’il aime.', 'calitiki'); ?></p>
        <div class="hero-actions">
            <a class="button" href="<?php echo calitiki_generator_url(); ?>"><?php esc_html_e('Imaginer son histoire', 'calitiki'); ?> <span>→</span></a>
            <a class="text-link" href="#comment-ca-marche"><?php esc_html_e('Voir comment ça marche', 'calitiki'); ?></a>
        </div>
        <ul class="trust-list" aria-label="<?php esc_attr_e('Avantages', 'calitiki'); ?>">
            <li><strong>21 × 21 cm</strong><span><?php esc_html_e('Album carré', 'calitiki'); ?></span></li>
            <li><strong>24–44</strong><span><?php esc_html_e('Pages au choix', 'calitiki'); ?></span></li>
            <li><strong><?php esc_html_e('Aperçu', 'calitiki'); ?></strong><span><?php esc_html_e('Avant achat', 'calitiki'); ?></span></li>
        </ul>
    </div>
    <div class="hero-visual" aria-label="<?php esc_attr_e('Exemple de livre personnalisé Calitiki', 'calitiki'); ?>">
        <span class="hero-orbit hero-orbit-one"></span><span class="hero-orbit hero-orbit-two"></span>
        <figure class="book-card book-card-back"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/paper-cut.webp'); ?>" alt="" /></figure>
        <figure class="book-card book-card-front">
            <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/hero-cover.webp'); ?>" alt="<?php esc_attr_e('Enfant et renard dans une forêt enchantée', 'calitiki'); ?>" />
            <figcaption><span><?php esc_html_e('Une aventure rien que pour toi', 'calitiki'); ?></span><small><?php esc_html_e('Édition personnalisée', 'calitiki'); ?></small></figcaption>
        </figure>
        <span class="sparkle sparkle-one">✦</span><span class="sparkle sparkle-two">✦</span>
    </div>
</section>

<section class="soft-band" id="comment-ca-marche">
    <div class="shell section-heading"><span class="eyebrow"><?php esc_html_e('Simple et magique', 'calitiki'); ?></span><h2><?php esc_html_e('De vos souvenirs à son livre en quatre étapes', 'calitiki'); ?></h2></div>
    <div class="shell steps-grid">
        <article><span>1</span><h3><?php esc_html_e('Racontez-nous l’enfant', 'calitiki'); ?></h3><p><?php esc_html_e('Dix questions simples nous aident à comprendre son univers, ses rêves et le message que vous souhaitez lui transmettre.', 'calitiki'); ?></p></article>
        <article><span>2</span><h3><?php esc_html_e('Ajoutez vos personnages', 'calitiki'); ?></h3><p><?php esc_html_e('Déposez jusqu’à cinq photos et attribuez à chacun un rôle : héros, guide, ami, mascotte ou membre de la famille.', 'calitiki'); ?></p></article>
        <article><span>3</span><h3><?php esc_html_e('Découvrez l’aperçu', 'calitiki'); ?></h3><p><?php esc_html_e('Feuilletez le livre en basse définition, vérifiez l’histoire et les illustrations avant de décider.', 'calitiki'); ?></p></article>
        <article><span>4</span><h3><?php esc_html_e('Choisissez votre format', 'calitiki'); ?></h3><p><?php esc_html_e('Recevez l’eBook ou commandez l’album imprimé. Chaque aventure garde un vrai début et une vraie fin.', 'calitiki'); ?></p></article>
    </div>
</section>

<section class="showcase shell">
    <div class="section-heading section-heading-split"><div><span class="eyebrow"><?php esc_html_e('Des mondes à explorer', 'calitiki'); ?></span><h2><?php esc_html_e('Une ambiance pour chaque imagination', 'calitiki'); ?></h2></div><p><?php esc_html_e('Forêt enchantée, espace étoilé ou océan de corail : les images aident à choisir l’univers qui fera briller ses yeux.', 'calitiki'); ?></p></div>
    <div class="world-grid">
        <article class="world-card world-card-large"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/enchanted-forest.webp'); ?>" alt="<?php esc_attr_e('Forêt enchantée', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Forêt enchantée', 'calitiki'); ?></h3><p><?php esc_html_e('Sentiers secrets, lumières douces et animaux malicieux.', 'calitiki'); ?></p></div></article>
        <article class="world-card"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/starry-space.webp'); ?>" alt="<?php esc_attr_e('Espace étoilé', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Espace étoilé', 'calitiki'); ?></h3></div></article>
        <article class="world-card"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/coral-ocean.webp'); ?>" alt="<?php esc_attr_e('Océan de corail', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Océan de corail', 'calitiki'); ?></h3></div></article>
    </div>
    <div class="world-grid-extra" id="tous-les-univers" hidden>
        <article class="world-card"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/cloud-castle.webp'); ?>" alt="<?php esc_attr_e('Château de nuages', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Château de nuages', 'calitiki'); ?></h3><p><?php esc_html_e('Tours dorées, ponts aériens et magie légère.', 'calitiki'); ?></p></div></article>
        <article class="world-card"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/dinosaur-valley.webp'); ?>" alt="<?php esc_attr_e('Vallée des dinosaures', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Vallée des dinosaures', 'calitiki'); ?></h3><p><?php esc_html_e('Dinosaures amicaux, grandes fougères et traces mystérieuses.', 'calitiki'); ?></p></div></article>
        <article class="world-card"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/wonder-city.webp'); ?>" alt="<?php esc_attr_e('Cité merveilleuse', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Cité merveilleuse', 'calitiki'); ?></h3><p><?php esc_html_e('Places lumineuses, passages secrets et habitants surprenants.', 'calitiki'); ?></p></div></article>
    </div>
    <p class="center-action"><button class="button button-ghost" type="button" data-universe-toggle aria-expanded="false" aria-controls="tous-les-univers" data-open-label="<?php esc_attr_e('Voir les trois autres univers', 'calitiki'); ?>" data-close-label="<?php esc_attr_e('Réduire la galerie', 'calitiki'); ?>"><span><?php esc_html_e('Voir les trois autres univers', 'calitiki'); ?></span> <b aria-hidden="true">↓</b></button></p>
</section>

<section class="formats" id="formats">
    <div class="shell formats-inner">
        <div class="formats-copy"><span class="eyebrow"><?php esc_html_e('À vous de choisir', 'calitiki'); ?></span><h2><?php esc_html_e('À lire sur écran ou à garder dans sa bibliothèque', 'calitiki'); ?></h2><p><?php esc_html_e('Vous ne payez qu’après avoir découvert l’aperçu. Le format et le nombre de pages restent votre choix.', 'calitiki'); ?></p></div>
        <article class="format-card"><span class="format-icon">⌁</span><div><h3><?php esc_html_e('eBook', 'calitiki'); ?></h3><p><?php esc_html_e('Version numérique prête à télécharger après paiement et envoyée par e-mail.', 'calitiki'); ?></p><strong><?php esc_html_e('Lecture immédiate', 'calitiki'); ?></strong></div></article>
        <article class="format-card format-card-featured"><span class="format-icon">▣</span><div><h3><?php esc_html_e('Album imprimé', 'calitiki'); ?></h3><p><?php esc_html_e('Un véritable livre carré de 21 × 21 cm, avec délai de fabrication annoncé avant paiement.', 'calitiki'); ?></p><strong><?php esc_html_e('Un cadeau à conserver', 'calitiki'); ?></strong></div></article>
    </div>
</section>

<section class="promise shell">
    <div class="promise-image"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/gentle-3d.webp'); ?>" alt="<?php esc_attr_e('Illustration personnalisée en style 3D douce', 'calitiki'); ?>" /></div>
    <div class="promise-copy"><span class="eyebrow"><?php esc_html_e('Une histoire qui a du sens', 'calitiki'); ?></span><h2><?php esc_html_e('Plus qu’un prénom glissé dans un livre', 'calitiki'); ?></h2><p><?php esc_html_e('Chaque aventure se construit autour d’un rêve, d’un obstacle et d’un message positif. Les personnages, leurs vêtements et les objets importants sont suivis d’une page à l’autre pour créer un récit cohérent.', 'calitiki'); ?></p><ul><li><?php esc_html_e('Une narration inspirée de StoryBrand', 'calitiki'); ?></li><li><?php esc_html_e('Des personnes et mascottes reconnaissables', 'calitiki'); ?></li><li><?php esc_html_e('Une morale adressée directement à l’enfant', 'calitiki'); ?></li></ul></div>
</section>

<section class="final-cta">
    <div class="shell"><span class="sparkle">✦</span><h2><?php esc_html_e('Quelle aventure allons-nous imaginer ensemble ?', 'calitiki'); ?></h2><p><?php esc_html_e('Commencez librement. Votre compte ne sera demandé qu’au moment de générer l’aperçu.', 'calitiki'); ?></p><a class="button button-light" href="<?php echo calitiki_generator_url(); ?>"><?php esc_html_e('Créer son livre', 'calitiki'); ?> <span>→</span></a></div>
</section>

<?php get_footer(); ?>

