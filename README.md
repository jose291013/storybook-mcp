# Storybook MCP

Backend de génération de livres jeunesse personnalisés par IA.

## Format éditorial

- Album carré 21 × 21 cm.
- 24 pages intérieures.
- Page 1 : introduction.
- Pages 2 à 23 : 11 doubles-pages, chacune composée d'une page de texte et d'une page illustrée. Le côté du texte alterne à chaque double-page.
- Page 24 : conclusion ou dédicace.
- Brouillon complet en basse qualité, puis version 300 dpi après validation/paiement.
- Typographie pédagogique Andika pour les textes et Patrick Hand pour les titres, distribuées sous licence SIL Open Font License dans `assets/fonts`.

## API

L'interface web est servie directement à la racine `/`. Elle guide le créateur en cinq étapes : enfant, histoire, style, photos et vérification.

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
    "universe": "Un jardin qui rejoint les étoiles la nuit",
    "signature_object": "Une petite lampe jaune",
    "important_people": "Son ami Noé et sa mascotte Pixel",
    "language": "FR"
  },
  "photos": [
    { "id": "photo-lina.jpg", "role": "child", "name": "Lina" },
    { "id": "photo-pixel.jpg", "role": "mascot", "name": "Pixel" },
    { "id": "photo-noe.jpg", "role": "friend", "name": "Noé", "relationship": "ami" }
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
