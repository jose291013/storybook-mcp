<?php get_header(); ?>
<div class="content-shell shell">
    <header class="archive-header"><span class="eyebrow">Calitiki</span><h1><?php bloginfo('name'); ?></h1></header>
    <div class="posts-grid">
    <?php if (have_posts()) : while (have_posts()) : the_post(); ?>
        <article <?php post_class('post-card'); ?>>
            <?php if (has_post_thumbnail()) : ?><a href="<?php the_permalink(); ?>"><?php the_post_thumbnail('large'); ?></a><?php endif; ?>
            <div><h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2><?php the_excerpt(); ?><a class="text-link" href="<?php the_permalink(); ?>"><?php esc_html_e('Lire la suite', 'calitiki'); ?></a></div>
        </article>
    <?php endwhile; the_posts_pagination(); else : ?>
        <p><?php esc_html_e('Aucun contenu pour le moment.', 'calitiki'); ?></p>
    <?php endif; ?>
    </div>
</div>
<?php get_footer(); ?>

