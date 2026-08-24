=== Calitiki Bridge ===
Contributors: calitiki
Requires at least: 6.5
Requires PHP: 7.4
Stable tag: 0.8.1
License: GPLv2 or later

Connecte de manière signée les comptes WooCommerce au générateur Calitiki hébergé sur Render.

== Installation ==

1. Compresser le dossier calitiki-bridge en ZIP.
2. Dans WordPress : Extensions > Ajouter une extension > Téléverser une extension.
3. Activer Calitiki Bridge.
4. Ouvrir WooCommerce > Calitiki Bridge.
5. Vérifier l’URL du générateur.
6. Copier le secret et l’URL du pont dans les variables Render indiquées.

Le plugin ne reçoit ni ne stocke les photos des enfants. Il émet uniquement une identité client signée et valable cinq minutes.

== Pilotage économique interne ==

Le sous-menu WooCommerce > Pilotage Calitiki est réservé aux administrateurs disposant de la capacité `manage_woocommerce`.
Il affiche le coût IA mesuré de chaque livre, avec la séparation entre fabrication normale, reprises techniques et corrections. Les montants restent internes : ils ne sont jamais ajoutés à « Mes créations Calitiki », aux réponses destinées au créateur ni aux pages publiques.
WordPress interroge le registre privé du générateur côté serveur avec une signature HMAC de courte durée. Le registre conserve uniquement des compteurs d’usage, modèles, étapes et montants numériques, jamais les réponses du questionnaire, les textes, les photos ou les illustrations.

== Suppression des créations non achetées ==

Dans « Mes créations Calitiki », le propriétaire peut supprimer définitivement une création non achetée après une confirmation explicite. Les livres liés à une commande actuellement payée ou à la continuité d’une série restent protégés. Les photos encore utilisées par une autre création sont conservées.
La bibliothèque transmet au générateur une photographie signée des projets réellement payés dans WooCommerce. Une ancienne ligne Render marquée payée par erreur ou liée à une commande désormais annulée est ainsi réconciliée sans effacer son historique commercial, puis redevient supprimable. Si WooCommerce ne peut pas établir cette liste de façon fiable, aucune protection n’est retirée.
Le résultat de l’action est conservé brièvement puis affiché après la redirection, sans dépendre de la session de notifications WooCommerce dans `admin-post.php`.
Si seul le nettoyage secondaire des fichiers privés reste en attente, le client voit une confirmation informative précisant que la création est supprimée de son compte, que le nettoyage se poursuit automatiquement et qu’aucune action n’est nécessaire.
La suppression est enregistrée avant le nettoyage S3 : la carte disparaît immédiatement et le compte WordPress n’attend jamais la suppression physique des fichiers. Un reçu de suppression reste autoritaire même si une ancienne ligne de projet subsiste, et les refus techniques affichent une consigne exploitable sans exposer les détails du stockage.

== Validation du scénario ==

Les projets dont le scénario attend une précision ou une validation apparaissent dans « Mes créations Calitiki ». Le bouton « Vérifier le scénario » reconnecte le propriétaire au générateur avant toute rédaction ou illustration.

== Notifications de création ==

Lorsque le client active l’option e-mail dans le créateur, WooCommerce l’avertit lorsque la couverture attend sa validation, si la génération est interrompue et lorsque l’aperçu complet est prêt. Pour les nouveaux livres V1, WooCommerce envoie aussi un rappel transactionnel 24 heures avant l’expiration de l’aperçu de 3 jours. Chaque message utilise un événement signé et idempotent puis ramène le propriétaire vers l’écran privé correspondant. Une nouvelle proposition de couverture ou une nouvelle tentative technique peut envoyer un nouveau message, mais le même événement ne peut jamais être envoyé deux fois.

== Produits de crédits ==

Créez un produit WooCommerce simple et virtuel, par exemple « Crédit Calitiki 2,50 € ».
Dans les données générales du produit, renseignez « Crédits Calitiki (centimes) » avec 250.
Après paiement, l’extension envoie un webhook signé au générateur. Un même numéro de commande ne peut créditer le portefeuille qu’une seule fois.
Lorsqu’un achat de crédits commence depuis un livre, le projet et l’étape d’origine sont conservés dans le panier puis dans la commande. Le panier et la page de confirmation proposent « Revenir à mon livre » ; ce retour signé rouvre le bon projet et actualise son solde, que le paiement soit confirmé, en attente, annulé ou échoué.

== Livres personnalisés ==

Les produits ayant les slugs `livre-enfant-personnalise-ebook` et `livre-enfant-personnalise-imprime` ne peuvent pas être ajoutés directement au panier.
Après un aperçu réussi, le générateur émet un lien signé et limité dans le temps. L’extension sélectionne alors la variation exacte du format et du nombre de pages, attache l’identifiant du projet au panier et déduit la totalité du prix de génération déjà payé.
Le paiement capture la remise ; une annulation, un échec ou un remboursement la rend de nouveau disponible pour cette création.

== Livraison eBook ==

Une commande numérique payée, y compris une commande dont les coupons ramènent le total à 0 €, rend la liseuse interactive permanente et déclenche la création du PDF privé. WooCommerce envoie ensuite un e-mail « Votre eBook est prêt » avec un lien temporaire et affiche les deux accès dans « Mes créations Calitiki ».
Dans cette bibliothèque, une création achetée conserve le vrai titre de sa couverture au lieu du nom générique de la variation WooCommerce. Les anciennes commandes récupèrent ce titre depuis le projet associé et les nouvelles le conservent aussi dans la ligne de commande.
Si Render ou le stockage privé est momentanément indisponible, l’extension planifie une nouvelle tentative avec WP-Cron. Un remboursement révoque l’accès au fichier.
Le client peut renvoyer le message depuis « Mes créations Calitiki ». Les anciens PDF sont reconstruits automatiquement dans l’ordre de lecture numérique, sans nouvelle génération d’illustrations.

Le renvoi manuel ne dépend pas de la session de notifications de l’administration WordPress et toute erreur du moteur d’e-mail est journalisée sans interrompre le site.

Dans Mes créations Calitiki, chaque livre personnalisé propose aussi le bouton Lire mon livre interactif. Le passage signé par WooCommerce renouvelle la session privée du générateur avant d’ouvrir le projet acheté dans la liseuse.

== Bibliothèque des aperçus ==

« Mes créations Calitiki » affiche aussi les aperçus générés avant achat, ainsi que les générations en cours ou interrompues. Un nouvel aperçu V1 reste lisible pendant 3 jours et sa date limite est affichée sur la carte. Sans achat, ses fichiers générés sont supprimés à l’échéance ; une commande numérique les conserve avec la liseuse et le PDF. WooCommerce reçoit uniquement des métadonnées signées ; les réponses, photos et fichiers privés restent sur le service de génération.
Chaque bouton renouvelle la session client puis ouvre directement le bon projet. Le lien « Ouvrir mon livre » de l’e-mail de fin de génération suit le même parcours et affiche immédiatement la preview terminée.

== Narration IA optionnelle ==

Le cout de la narration payee est inclus dans le pilotage economique interne du livre. Comme l'endpoint Speech renvoie le MP3 sans compteur d'usage, ce montant est signale par `~` et calcule depuis la duree reelle du fichier avec la grille tarifaire officielle du modele.

Créez un produit variable et virtuel avec le slug `narration-ia-calitiki` et le SKU `CAL-NARRATION`. Ajoutez les mêmes variations de pages que pour l’eBook (24, 28, 32, 36, 40 et 44 pages) et fixez librement leur prix.
Le client choisit la voix et le style depuis « Mes créations Calitiki ». Le produit ne peut pas être ajouté directement sans cette configuration signée. La génération démarre uniquement après paiement et ne consomme jamais la remise liée aux crédits d’aperçu.
Les fichiers audio sont privés, générés une seule fois par scène et repris au dernier point enregistré après une interruption. La liseuse conserve gratuitement la voix de l’appareil lorsque cette option n’a pas été achetée.

== Portefeuille client ==

La rubrique « Mes crédits Calitiki » dans Mon compte affiche le solde, l’historique des achats, promotions, aperçus et restitutions techniques, ainsi qu’un bouton d’achat de crédits.
Dans le créateur, le solde est visible dès la connexion et toute dépense d’aperçu demande une confirmation explicite.
