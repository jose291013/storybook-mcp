<?php get_header(); ?>

<section class="meaning-hero shell">
    <div class="meaning-hero__copy">
        <span class="eyebrow"><?php esc_html_e('Une histoire pour lui parler autrement', 'calitiki'); ?></span>
        <h1><?php esc_html_e('Ce que vous aimeriez lui transmettre devient une aventure dont il est le héros.', 'calitiki'); ?></h1>
        <p><?php esc_html_e('Parlez-nous d’une situation, d’une petite difficulté ou d’un message important. Calitiki vous aide à en faire une histoire personnelle, subtile et captivante pour votre enfant.', 'calitiki'); ?></p>
        <div class="hero-actions">
            <a class="button" href="<?php echo calitiki_generator_url(); ?>"><?php esc_html_e('Créer une histoire pour mon enfant', 'calitiki'); ?> <span>→</span></a>
            <a class="text-link" href="#exemples"><?php esc_html_e('Voir un exemple concret', 'calitiki'); ?></a>
        </div>
        <ul class="meaning-trust-list" aria-label="<?php esc_attr_e('Les engagements Calitiki', 'calitiki'); ?>">
            <li><span aria-hidden="true">✓</span><?php esc_html_e('Vous validez le scénario', 'calitiki'); ?></li>
            <li><span aria-hidden="true">✓</span><?php esc_html_e('Photos et livre jamais rendus publics', 'calitiki'); ?></li>
            <li><span aria-hidden="true">✓</span><?php esc_html_e('Aperçu avant achat', 'calitiki'); ?></li>
        </ul>
    </div>
    <div class="meaning-hero__visual" aria-label="<?php esc_attr_e('Une intention transformée en aventure personnalisée', 'calitiki'); ?>">
        <article class="intention-note">
            <span><?php esc_html_e('Ce que vous souhaitez lui transmettre', 'calitiki'); ?></span>
            <p><?php esc_html_e('« J’aimerais l’aider à recommencer quand tout ne fonctionne pas du premier coup. »', 'calitiki'); ?></p>
        </article>
        <span class="meaning-arrow" aria-hidden="true">→</span>
        <figure class="meaning-book">
            <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/hero-cover.webp'); ?>" alt="<?php esc_attr_e('Couverture d’un album Calitiki personnalisé', 'calitiki'); ?>" />
            <figcaption><strong><?php esc_html_e('Une aventure qu’il aura envie de vivre', 'calitiki'); ?></strong><small><?php esc_html_e('Le message se découvre par ses choix', 'calitiki'); ?></small></figcaption>
        </figure>
        <span class="meaning-spark meaning-spark-one" aria-hidden="true">✦</span>
        <span class="meaning-spark meaning-spark-two" aria-hidden="true">✧</span>
    </div>
</section>

<section class="situation-band">
    <div class="shell situation-band__inner">
        <div>
            <span class="eyebrow"><?php esc_html_e('Le point de départ, c’est votre intention', 'calitiki'); ?></span>
            <h2><?php esc_html_e('Il y a peut-être quelque chose que vous aimeriez l’aider à vivre…', 'calitiki'); ?></h2>
        </div>
        <ul class="situation-list">
            <li><?php esc_html_e('Prendre confiance', 'calitiki'); ?></li>
            <li><?php esc_html_e('Accueillir un changement', 'calitiki'); ?></li>
            <li><?php esc_html_e('Exprimer ce qu’il ressent', 'calitiki'); ?></li>
            <li><?php esc_html_e('Trouver sa place', 'calitiki'); ?></li>
            <li><?php esc_html_e('Persévérer autrement', 'calitiki'); ?></li>
            <li class="situation-list__open"><?php esc_html_e('Ou une situation qui n’appartient qu’à votre famille', 'calitiki'); ?></li>
        </ul>
    </div>
</section>

<section class="story-examples shell" id="exemples">
    <div class="section-heading">
        <span class="eyebrow"><?php esc_html_e('Des exemples, pas des promesses abstraites', 'calitiki'); ?></span>
        <h2><?php esc_html_e('Une situation réelle devient une aventure à sa hauteur', 'calitiki'); ?></h2>
        <p><?php esc_html_e('Calitiki ne récite pas une morale. L’enfant expérimente le message à travers les essais, les décisions et les conséquences de son histoire.', 'calitiki'); ?></p>
    </div>
    <div class="story-example-grid">
        <article class="story-example-card">
            <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/wonder-city.webp'); ?>" alt="<?php esc_attr_e('Enfant dans une ville merveilleuse', 'calitiki'); ?>" />
            <div>
                <span class="story-example-label"><?php esc_html_e('L’intention de l’adulte', 'calitiki'); ?></span>
                <h3><?php esc_html_e('L’aider à ne pas abandonner trop vite', 'calitiki'); ?></h3>
                <p><strong><?php esc_html_e('L’aventure :', 'calitiki'); ?></strong> <?php esc_html_e('dans la Ville merveilleuse, l’enfant doit reconstruire un pont en essayant plusieurs solutions.', 'calitiki'); ?></p>
                <p><strong><?php esc_html_e('Ce qu’il découvre :', 'calitiki'); ?></strong> <?php esc_html_e('changer de méthode et demander de l’aide font aussi partie de la réussite.', 'calitiki'); ?></p>
            </div>
        </article>
        <article class="story-example-card">
            <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/coral-ocean.webp'); ?>" alt="<?php esc_attr_e('Aventure dans un océan de corail', 'calitiki'); ?>" />
            <div>
                <span class="story-example-label"><?php esc_html_e('L’intention de l’adulte', 'calitiki'); ?></span>
                <h3><?php esc_html_e('L’encourager à dire ce qu’il ressent', 'calitiki'); ?></h3>
                <p><strong><?php esc_html_e('L’aventure :', 'calitiki'); ?></strong> <?php esc_html_e('sous l’océan, des bulles mystérieuses ne révèlent leur chemin qu’à celui qui ose leur répondre.', 'calitiki'); ?></p>
                <p><strong><?php esc_html_e('Ce qu’il découvre :', 'calitiki'); ?></strong> <?php esc_html_e('mettre des mots sur une émotion peut aider les autres à le comprendre.', 'calitiki'); ?></p>
            </div>
        </article>
        <article class="story-example-card">
            <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/enchanted-forest.webp'); ?>" alt="<?php esc_attr_e('Aventure dans une forêt enchantée', 'calitiki'); ?>" />
            <div>
                <span class="story-example-label"><?php esc_html_e('L’intention de l’adulte', 'calitiki'); ?></span>
                <h3><?php esc_html_e('L’accompagner face à un changement', 'calitiki'); ?></h3>
                <p><strong><?php esc_html_e('L’aventure :', 'calitiki'); ?></strong> <?php esc_html_e('dans la forêt, les lucioles déplacent leur refuge et invitent l’enfant à inventer de nouveaux repères.', 'calitiki'); ?></p>
                <p><strong><?php esc_html_e('Ce qu’il découvre :', 'calitiki'); ?></strong> <?php esc_html_e('on peut garder ce qui compte tout en avançant vers quelque chose de nouveau.', 'calitiki'); ?></p>
            </div>
        </article>
    </div>
</section>

<section class="method-section" id="comment-ca-marche">
    <div class="shell">
        <div class="section-heading">
            <span class="eyebrow"><?php esc_html_e('Vous gardez la direction de l’histoire', 'calitiki'); ?></span>
            <h2><?php esc_html_e('De votre intention à son livre, étape par étape', 'calitiki'); ?></h2>
        </div>
        <div class="method-grid">
            <article><span>1</span><h3><?php esc_html_e('Racontez la situation', 'calitiki'); ?></h3><p><?php esc_html_e('Avec vos propres mots, expliquez simplement ce que vous aimeriez l’aider à vivre, essayer ou surmonter.', 'calitiki'); ?></p></article>
            <article><span>2</span><h3><?php esc_html_e('Choisissez une approche', 'calitiki'); ?></h3><p><?php esc_html_e('Calitiki propose trois aventures différentes : relationnelle, symbolique ou fondée sur l’action.', 'calitiki'); ?></p></article>
            <article><span>3</span><h3><?php esc_html_e('Validez le scénario', 'calitiki'); ?></h3><p><?php esc_html_e('Vous relisez les trois actes, les personnages et les moments importants avant toute illustration intérieure.', 'calitiki'); ?></p></article>
            <article><span>4</span><h3><?php esc_html_e('Découvrez son livre', 'calitiki'); ?></h3><p><?php esc_html_e('Vous vérifiez la couverture puis feuilletez l’aperçu complet avant de choisir de l’acheter.', 'calitiki'); ?></p></article>
        </div>
    </div>
</section>

<section class="listen-section shell">
    <div class="listen-card">
        <div class="listen-copy">
            <span class="eyebrow"><?php esc_html_e('À lire ensemble… ou à écouter', 'calitiki'); ?></span>
            <h2><?php esc_html_e('Son histoire peut aussi lui être racontée', 'calitiki'); ?></h2>
            <p><?php esc_html_e('Après l’achat de l’eBook, choisissez une voix et une manière de raconter. L’enfant peut réécouter son aventure dans le lecteur interactif, à son rythme, lorsque la lecture à voix haute n’est pas possible.', 'calitiki'); ?></p>
            <p class="listen-disclosure"><?php esc_html_e('Option vendue séparément · Voix synthétique générée par intelligence artificielle', 'calitiki'); ?></p>
        </div>
        <div class="audio-demo" aria-label="<?php esc_attr_e('Exemple visuel du lecteur audio Calitiki', 'calitiki'); ?>">
            <button type="button" aria-label="<?php esc_attr_e('Exemple de lecture', 'calitiki'); ?>" disabled>▶</button>
            <div><strong><?php esc_html_e('Le sentier des rêves', 'calitiki'); ?></strong><span><?php esc_html_e('Voix douce · narration calme', 'calitiki'); ?></span></div>
            <div class="audio-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        </div>
    </div>
</section>

<section class="trust-section">
    <div class="shell">
        <div class="section-heading">
            <span class="eyebrow"><?php esc_html_e('Une création assistée, jamais opaque', 'calitiki'); ?></span>
            <h2><?php esc_html_e('L’intelligence artificielle crée. Vous choisissez et vous validez.', 'calitiki'); ?></h2>
            <p><?php esc_html_e('Calitiki utilise l’intelligence artificielle pour proposer le scénario, rédiger le texte, créer les illustrations et, si vous la choisissez, la narration. Vos décisions restent la direction éditoriale du livre.', 'calitiki'); ?></p>
        </div>
        <div class="trust-card-grid">
            <article><span aria-hidden="true">✎</span><h3><?php esc_html_e('Votre contrôle', 'calitiki'); ?></h3><p><?php esc_html_e('Vous validez l’intention, le scénario et la couverture avant que le livre complet soit créé.', 'calitiki'); ?></p></article>
            <article><span aria-hidden="true">◎</span><h3><?php esc_html_e('Une IA clairement indiquée', 'calitiki'); ?></h3><p><?php esc_html_e('Les textes, images et voix produits avec l’aide de l’IA sont présentés comme tels, sans prétendre à une création humaine traditionnelle.', 'calitiki'); ?></p></article>
            <article><span aria-hidden="true">⌂</span><h3><?php esc_html_e('Jamais rendu public', 'calitiki'); ?></h3><p><?php esc_html_e('Vos photos, vos réponses et votre livre ne sont ni publiés ni accessibles aux autres clients. Ils sont traités uniquement pour créer, conserver et livrer votre histoire.', 'calitiki'); ?></p></article>
        </div>
        <?php if (function_exists('get_privacy_policy_url') && get_privacy_policy_url()) : ?>
            <p class="trust-legal-link"><a class="text-link" href="<?php echo esc_url(get_privacy_policy_url()); ?>"><?php esc_html_e('Consulter notre politique de confidentialité', 'calitiki'); ?></a></p>
        <?php endif; ?>
    </div>
</section>

<section class="showcase shell">
    <div class="section-heading section-heading-split">
        <div><span class="eyebrow"><?php esc_html_e('L’imaginaire au service du message', 'calitiki'); ?></span><h2><?php esc_html_e('Choisissez le monde où il vivra son aventure', 'calitiki'); ?></h2></div>
        <p><?php esc_html_e('L’univers attire l’enfant dans l’histoire. La situation que vous avez racontée en reste le cœur.', 'calitiki'); ?></p>
    </div>
    <div class="world-grid">
        <article class="world-card world-card-large"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/enchanted-forest.webp'); ?>" alt="<?php esc_attr_e('Forêt enchantée', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Forêt enchantée', 'calitiki'); ?></h3><p><?php esc_html_e('Sentiers secrets, lumières douces et animaux malicieux.', 'calitiki'); ?></p></div></article>
        <article class="world-card"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/starry-space.webp'); ?>" alt="<?php esc_attr_e('Espace étoilé', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Espace étoilé', 'calitiki'); ?></h3></div></article>
        <article class="world-card"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/coral-ocean.webp'); ?>" alt="<?php esc_attr_e('Océan de corail', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Océan de corail', 'calitiki'); ?></h3></div></article>
    </div>
    <div class="world-grid-extra" id="tous-les-univers" hidden>
        <article class="world-card"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/cloud-castle.webp'); ?>" alt="<?php esc_attr_e('Château de nuages', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Château de nuages', 'calitiki'); ?></h3></div></article>
        <article class="world-card"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/dinosaur-valley.webp'); ?>" alt="<?php esc_attr_e('Vallée des dinosaures', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Vallée des dinosaures', 'calitiki'); ?></h3></div></article>
        <article class="world-card"><img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/wonder-city.webp'); ?>" alt="<?php esc_attr_e('Ville merveilleuse', 'calitiki'); ?>" /><div><h3><?php esc_html_e('Ville merveilleuse', 'calitiki'); ?></h3></div></article>
    </div>
    <p class="center-action"><button class="button button-ghost" type="button" data-universe-toggle aria-expanded="false" aria-controls="tous-les-univers" data-open-label="<?php esc_attr_e('Voir les trois autres univers', 'calitiki'); ?>" data-close-label="<?php esc_attr_e('Réduire la galerie', 'calitiki'); ?>"><span><?php esc_html_e('Voir les trois autres univers', 'calitiki'); ?></span> <b aria-hidden="true">↓</b></button></p>
</section>

<section class="formats" id="formats">
    <div class="shell formats-inner">
        <div class="formats-copy"><span class="eyebrow"><?php esc_html_e('Votre histoire reste disponible', 'calitiki'); ?></span><h2><?php esc_html_e('À lire sur écran, à écouter ou bientôt à garder en album', 'calitiki'); ?></h2><p><?php esc_html_e('La génération comprend votre livre interactif privé. Vous choisissez ensuite librement d’acheter aussi le fichier eBook ou, plus tard, l’album imprimé.', 'calitiki'); ?></p><a class="text-link" href="<?php echo esc_url(calitiki_creations_url()); ?>"><?php esc_html_e('Ouvrir Mes créations Calitiki', 'calitiki'); ?> →</a></div>
        <a class="format-card" href="<?php echo esc_url(calitiki_product_url('ebook')); ?>" aria-label="<?php esc_attr_e('Découvrir l’eBook personnalisé téléchargeable', 'calitiki'); ?>"><span class="format-icon">⌁</span><div><span class="format-status format-status-digital"><?php esc_html_e('Achat facultatif après génération', 'calitiki'); ?></span><h3><?php esc_html_e('eBook PDF', 'calitiki'); ?></h3><p><?php esc_html_e('Téléchargez votre livre dans le format choisi. La lecture interactive privée reste accessible même sans cet achat.', 'calitiki'); ?></p><strong><?php echo wp_kses_post(sprintf(__('À partir de %s TTC · Découvrir', 'calitiki'), calitiki_v1_ebook_minimum_price_html())); ?> <span aria-hidden="true">→</span></strong></div></a>
        <article class="format-card format-card-featured format-card-coming-soon" aria-label="<?php esc_attr_e('Livre personnalisé imprimé prochainement disponible', 'calitiki'); ?>"><span class="format-icon">▣</span><div><span class="format-status"><?php esc_html_e('Prochainement disponible', 'calitiki'); ?></span><h3><?php esc_html_e('Album imprimé', 'calitiki'); ?></h3><p><?php esc_html_e('Notre service d’impression et de livraison est en préparation pour le livre carré de 21 × 21 cm.', 'calitiki'); ?></p><strong><?php esc_html_e('Pas encore disponible à l’achat', 'calitiki'); ?></strong></div></article>
    </div>
</section>

<section class="final-cta">
    <div class="shell">
        <span class="sparkle">✦</span>
        <h2><?php esc_html_e('Quelle histoire pourrait l’aider à avancer aujourd’hui ?', 'calitiki'); ?></h2>
        <p><?php esc_html_e('Commencez avec une situation ou une intention, même encore imprécise. Calitiki vous aidera à trouver la bonne aventure.', 'calitiki'); ?></p>
        <a class="button button-light" href="<?php echo calitiki_generator_url(); ?>"><?php esc_html_e('Créer une histoire pour mon enfant', 'calitiki'); ?> <span>→</span></a>
    </div>
</section>

<?php get_footer(); ?>
