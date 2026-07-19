# Prototype de liseuse interactive Calitiki

Ce prototype autonome valide le rythme narratif **écouter ou lire → imaginer → révéler l’illustration → continuer** sans modifier la fabrication des eBooks PDF ni le commerce WooCommerce.

## Accès local

1. Lancez `npm start`.
2. Ouvrez `http://localhost:3000/interactive-reader/`.
3. Sur mobile, utilisez l’adresse HTTPS de l’environnement de test afin d’essayer l’installation PWA.

## Règles du prototype

- Une scène commence toujours par son texte, sans afficher son illustration.
- La scène suivante est inaccessible avant l’action **Découvrir l’image**.
- L’écran d’anticipation possède uniquement une commande de retour vers une scène déjà vue.
- Après révélation, les commandes inférieures permettent de revenir ou de passer à la scène suivante.
- Le texte superposé peut être masqué puis restauré.
- Le haut-parleur utilise uniquement la synthèse vocale locale du navigateur. Aucun appel d’API audio n’est effectué.

## Mise en page adaptative

- Sur mobile, la liseuse occupe tout l’écran et conserve une lecture verticale immersive.
- Sur tablette, le cadre de lecture et le texte superposé s’élargissent sans masquer toute l’illustration.
- Sur ordinateur et grande tablette en paysage, l’illustration reste visible à gauche tandis que le texte, l’audio et la navigation sont regroupés dans un panneau à droite.
- Lorsque le texte est masqué sur grand écran, l’illustration reprend toute la largeur disponible.
- Les textes trop longs restent défilables au toucher, à la molette et au clavier.

## Hors périmètre

- authentification WooCommerce ;
- droits d’accès après achat ;
- livres privés et liens S3 signés ;
- narration IA stockée ;
- bibliothèque client ;
- lecture hors connexion de données privées.

Le livre de démonstration utilise exclusivement les illustrations publiques du catalogue d’exemples.
