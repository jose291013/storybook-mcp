<?php get_header(); ?>
<div class="content-shell shell">
<?php while (have_posts()) : the_post(); ?>
    <article <?php post_class('content-card'); ?>>
        <header><span class="eyebrow">Calitiki</span><h1><?php the_title(); ?></h1></header>
        <div class="entry-content"><?php the_content(); ?></div>
    </article>
<?php endwhile; ?>
</div>
<?php get_footer(); ?>

