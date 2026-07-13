# Storybook MCP

Backend de génération de livres jeunesse personnalisés par IA.

## Format éditorial

- Album carré 21 × 21 cm.
- 24, 28, 32, 36, 40 ou 44 pages intérieures, au choix du créateur.
- Page 1 : introduction.
- Entre l'introduction et la conclusion : 11 à 21 doubles-pages, chacune composée d'une page de texte et d'une page illustrée. Le côté du texte alterne à chaque double-page.
- Dernière page : conclusion ou dédicace adressée directement à l'enfant héros.
- Brouillon complet en basse qualité, puis version 300 dpi après validation/paiement.
- Choix visuel entre une typographie pédagogique Andika et une écriture Patrick Hand, distribuées sous licence SIL Open Font License dans `assets/fonts`.

## API

L'interface web est servie directement à la racine `/`. Elle guide le créateur en cinq étapes : enfant, histoire, style, photos et vérification. L'interface existe en français, espagnol et anglais, indépendamment de la langue choisie pour le livre.

Le décor, le style d'illustration, la police et le nombre de pages sont choisis au moyen d'aperçus visuels. Les photos peuvent être déposées par glisser-déposer, jusqu'à cinq personnages de référence.

### Intégration WooCommerce

À chaque changement de configuration, l'interface émet l'événement navigateur `storybook:configuration`. Son champ `detail` contient notamment `page_count`, `font_style`, `style_id`, `universe_id`, `book_language` et `woo_variation_key` (`pages_24` à `pages_44`). La même clé est exposée dans `document.documentElement.dataset.storybookVariation` afin qu'un connecteur WooCommerce puisse sélectionner la variation et mettre à jour le prix.

### Questionnaire

`GET /api/questionnaire` retourne les dix questions, les rôles disponibles pour les photos et le format du livre.

La réponse contient également six directions artistiques : aquarelle douce, gouache moderne, papier découpé, crayons pastel, 3D douce et encre enchantée.

### Photos de référence

`POST /api/upload` accepte :

- un ancien champ `photo` ; ou
- jusqu'à cinq fichiers dans le champ multipart `photos`.

Chaque fichier doit ensuite être associé à un rôle dans la requête de génération : `child`, `mascot`, `friend`, `family` ou `other`.

Lorsqu'une photo correspond à un personnage présent dans une scène, elle est envoyée directement au modèle d'image comme référence haute fidélité. La couverture sert ensuite de cadre de continuité pour verrouiller le visage, la tenue, l'espèce de la mascotte, ses couleurs et ses accessoires sur toutes les pages.

### Génération du brouillon

`POST /api/preview`

```json
{
  "questionnaire": {
    "hero_name": "Lina",
    "age": 6,
    "favorite_activities": "Dessiner et observer les étoiles",
    "personality": "Curieuse, sensible et drôle",
    "dream": "Découvrir une nouvelle constellation",
    "challenge": "Oser demander de l'aide",
    "message": "On avance mieux ensemble",
    "universe_id": "starry_space",
    "universe_details": "Un jardin qui rejoint les étoiles la nuit",
    "style_id": "gentle_3d",
    "font_style": "school_round",
    "page_count": 32,
    "signature_object": "Une petite lampe jaune",
    "important_people": "Son ami Noé et sa mascotte Pixel",
    "language": "FR"
  },
  "photos": [
    { "id": "photo-lina.jpg", "role": "child", "story_role": "hero", "name": "Lina" },
    { "id": "photo-pixel.jpg", "role": "mascot", "story_role": "companion", "name": "Pixel" },
    { "id": "photo-noe.jpg", "role": "friend", "story_role": "guide", "name": "Noé", "relationship": "ami" }
  ]
}
```

La route répond immédiatement avec un `jobId`. Suivre l'avancement avec `GET /api/jobs/:id`.

### Finalisation

`POST /api/finalize` avec `{ "jobId": "..." }` génère les illustrations haute qualité et les pages finales en 300 dpi.

## Développement

```bash
npm install
npm test
npm start
```

Copier `.env.example` vers `.env` et ajouter une clé OpenAI pour utiliser les routes de génération. Les routes `/health` et `/api/questionnaire` restent disponibles sans clé.
