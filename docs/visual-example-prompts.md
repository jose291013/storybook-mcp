# Prompts des exemples visuels

Ces visuels sont des ressources fixes du site. Ils ne doivent être générés qu'une seule fois, puis exportés en WebP qualité 82, sans texte ni logo.

## Spécifications communes

- Format des cartes : 1200 × 800 px, paysage 3:2.
- Format de la couverture d'accueil : 1200 × 1200 px, carré.
- Aucun texte dans l'image : le titre sera ajouté par le site.
- Personnages fictifs uniquement, sans ressemblance avec un enfant réel.
- Personnage témoin : enfant fictif de 6 ans, cheveux bruns bouclés, veste bleu canard, petit sac à dos jaune moutarde.
- Mascotte témoin : petit renard roux, museau blanc, foulard vert sauge.
- Conserver exactement leur visage, tenue, proportions et couleurs dans toute la série.

## Couverture de la page d'accueil

Nom du fichier : `public/assets/examples/hero/hero-cover.webp`

```text
Square cover illustration for a premium personalized children's picture book. A fictional six-year-old child with curly dark-brown hair, teal jacket and mustard-yellow backpack kneels beside a small friendly red fox with a white muzzle and sage-green scarf. They discover a tiny glowing golden star in an enchanted forest at blue hour. Luminous flowers, fireflies, warm cinematic light, expressive joyful faces, gentle magical atmosphere, polished high-end children's publishing illustration, rich detail but clear focal point, safe empty space in the upper third for a title overlay. No words, no letters, no logo, no watermark, no border, no photorealism. 1:1 square composition.
```

## Six univers actuellement affichés

Ces six fichiers sont les exemples actifs du premier écran du créateur :

- `public/assets/examples/universes/enchanted_forest-likeness.webp`
- `public/assets/examples/universes/starry_space-likeness.webp`
- `public/assets/examples/universes/coral_ocean-likeness.webp`
- `public/assets/examples/universes/cloud_castle-likeness.webp`
- `public/assets/examples/universes/dinosaur_valley-likeness.webp`
- `public/assets/examples/universes/wonder_city-likeness.webp`

Ils ont été générés en mode **image edit** avec `public/assets/examples/styles/reference-child.webp` comme référence d'identité stricte. Consigne commune :

```text
Create a premium 3:2 children's-book universe example using the supplied fictional reference child as a strict identity and wardrobe reference. Preserve the same face, age, dark curly hair, teal jacket and mustard backpack. Show the child as the active explorer in a safe, readable story moment. Polished faithful editorial illustration with natural proportions, warm cinematic light and strong facial recognizability. No fox, no extra recurring child, no text, letters, logo, trademark, border or watermark.
```

Variantes :

- **Forêt enchantée** : arche de très grands arbres moussus, sentier secret, fleurs lumineuses, lanternes et lucioles ; le passage dans l'arbre doit pouvoir déclencher l'aventure.
- **Espace étoilé** : capsule-bulle transparente sûre, planètes colorées, nébuleuse et jardin lunaire ; le moyen de déplacement doit être clairement visible.
- **Océan de corail** : bulle transparente de respiration et de communication autour de la tête, récif lumineux, poissons curieux et chemin de perles ; aucun téléphone ordinaire utilisé sous l'eau.
- **Château des nuages** : pont de nuages stable, tours dorées, petits aéronefs et porte accueillante ; montrer un moyen sûr d'atteindre le château.
- **Vallée des dinosaures** : portail lumineux découvert au premier plan, fougères géantes, cascade, dinosaures amicaux et volcan lointain calme.
- **Ville merveilleuse** : ateliers magiques, toits colorés, ponts, lanternes et passage secret ; l'enfant suit une piste visuelle vers un atelier.

Desktop révèle la photo témoin au survol ou au focus clavier ; mobile utilise le bouton explicite **Voir la photo de référence**.

## Anciens exemples d'univers conservés comme ressources

Les fichiers sans suffixe `-likeness` ci-dessous ne sont plus affichés par le créateur. Ils restent versionnés pour comparaison historique.

Générer les six images avec la même finition : illustration 3D douce éditoriale, lumière chaleureuse, volumes arrondis et non photoréalistes. Garder le même enfant et le même renard.

### Forêt enchantée

Nom : `public/assets/examples/universes/enchanted_forest.webp`

```text
Wide children's book illustration showing the fixed fictional child and fox walking through a truly enchanted forest: colossal mossy trees forming arches, secret winding path, luminous blue and golden flowers, friendly fireflies, tiny floating lights, a distant tree-house lantern. Wonder and discovery, safe and welcoming, soft editorial 3D finish, rounded shapes, warm cinematic lighting. No text, no logo, no watermark. 3:2 landscape.
```

### Espace étoilé

Nom : `public/assets/examples/universes/starry_space.webp`

```text
Wide children's book illustration showing the same fixed fictional child and fox inside a small transparent bubble spacecraft crossing a marvelous friendly cosmos: colorful round planets, smiling-looking constellations without literal faces, sparkling nebulae, a gentle comet trail and a tiny moon garden. Adventurous but never frightening, soft editorial 3D finish, rounded shapes, warm cinematic lighting. No text, no logo, no watermark. 3:2 landscape.
```

### Océan de corail

Nom : `public/assets/examples/universes/coral_ocean.webp`

```text
Wide children's book illustration showing the same fixed fictional child and fox exploring underwater inside gentle transparent breathing bubbles: bright coral garden, turquoise sun rays, curious colorful fish, swaying sea plants, a tiny pearl path leading to a friendly seahorse. Clear, joyful and safe ocean world, soft editorial 3D finish, rounded shapes, warm cinematic lighting. No text, no logo, no watermark. 3:2 landscape.
```

### Château des nuages

Nom : `public/assets/examples/universes/cloud_castle.webp`

```text
Wide children's book illustration showing the same fixed fictional child and fox arriving at a magnificent castle floating above the clouds: golden towers, pastel flags, bridges made of soft clouds, tiny airships, sunrise rays and a welcoming open gate. Gentle fairytale magic, no danger, soft editorial 3D finish, rounded shapes, warm cinematic lighting. No text, no logo, no watermark. 3:2 landscape.
```

### Vallée des dinosaures

Nom : `public/assets/examples/universes/dinosaur_valley.webp`

```text
Wide children's book illustration showing the same fixed fictional child and fox in a lush prehistoric valley: giant ferns, waterfall, warm volcano far in the background with no eruption, a friendly baby long-neck dinosaur and a playful triceratops, oversized leaves and sunbeams. Curious and reassuring, soft editorial 3D finish, rounded shapes, warm cinematic lighting. No text, no logo, no watermark. 3:2 landscape.
```

### Ville merveilleuse

Nom : `public/assets/examples/universes/wonder_city.webp`

```text
Wide children's book illustration showing the same fixed fictional child and fox entering a wonderful fantasy city: colorful crooked rooftops, magical workshops, flower-covered balconies, tiny bridges, glowing street lamps and a secret passage visible between two houses. Bustling but warm and readable, soft editorial 3D finish, rounded shapes, cinematic lighting. No text, no logo, no watermark. 3:2 landscape.
```

## Comparaison des six finitions

### Étape 1 — scène maître

Générer d'abord cette image. Elle servira de référence image-à-image pour toutes les variantes.

```text
Reference composition for a children's book style comparison. The fixed fictional child kneels on the LEFT beside one glowing brass lantern under a large old tree at twilight. The fixed small red fox sits on the RIGHT, looking at the lantern. One curved forest path in the background, three blue flowers in the lower-left corner, crescent moon in the upper-right corner. Medium-wide eye-level camera, child and fox fully visible, balanced triangular composition, calm wonder. Neutral clean digital illustration, moderate detail. No text, no logo, no watermark. 3:2 landscape.
```

### Étape 2 — variantes

Pour chaque variante, joindre l'image maître et utiliser cette consigne commune avant la consigne de finition :

```text
Use the supplied master image as a strict composition and identity reference. Preserve exactly the camera, crop, poses, positions, facial features, teal jacket, mustard backpack, fox species, white muzzle, sage scarf, lantern, tree, path, three flowers and crescent moon. Change ONLY the rendering technique described below. Do not add, remove or move anything. No text, no logo, no watermark. 3:2 landscape.
```

1. `public/assets/examples/styles/soft_watercolor.webp`

```text
Soft transparent watercolor on fine cold-pressed paper, subtle pigment blooms, delicate pencil contours, poetic natural palette, warm luminous washes, premium children's picture-book print finish.
```

2. `public/assets/examples/styles/modern_gouache.webp`

```text
Modern hand-painted gouache, generous matte color blocks, visible brush texture, simplified expressive shapes, warm editorial palette, premium contemporary children's picture-book finish.
```

3. `public/assets/examples/styles/paper_cut.webp`

```text
Handcrafted layered paper-cut illustration, clearly visible paper fibers and cut edges, stacked colored-paper shapes, subtle physical depth and soft cast shadows, charming premium publishing finish.
```

4. `public/assets/examples/styles/pastel_pencil.webp`

```text
Colored-pencil and soft-pastel illustration on lightly textured paper, visible hand-drawn strokes, powdery shading, tender expressions, intimate reassuring children's book finish.
```

5. `public/assets/examples/styles/gentle_3d.webp`

```text
Gentle stylized 3D children's illustration, rounded soft volumes, tactile fabric and wood materials, highly expressive characters, warm cinematic global illumination, colorful but not photorealistic.
```

6. `public/assets/examples/styles/enchanted_ink.webp`

```text
Fine enchanted ink linework with translucent colored washes, elegant precise contours, intricate magical details, luminous gold and blue accents, sophisticated classic children's book finish.
```

## Contrôle avant livraison

- Les six images de finition doivent se superposer presque parfaitement : seule la technique change.
- Les six univers doivent garder les mêmes personnages et la même finition 3D douce.
- Refuser toute image contenant des mots, des lettres, un logo ou une signature.
- Vérifier la lisibilité en miniature avant l'export WebP.
