=== Calitiki Bridge ===
Contributors: calitiki
Requires at least: 6.5
Requires PHP: 7.4
Stable tag: 0.5.6
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

== Produits de crédits ==

Créez un produit WooCommerce simple et virtuel, par exemple « Crédit Calitiki 2,50 € ».
Dans les données générales du produit, renseignez « Crédits Calitiki (centimes) » avec 250.
Après paiement, l’extension envoie un webhook signé au générateur. Un même numéro de commande ne peut créditer le portefeuille qu’une seule fois.

== Livres personnalisés ==

Les produits ayant les slugs `livre-enfant-personnalise-ebook` et `livre-enfant-personnalise-imprime` ne peuvent pas être ajoutés directement au panier.
Après un aperçu réussi, le générateur émet un lien signé et limité dans le temps. L’extension sélectionne alors la variation du nombre de pages, attache l’identifiant du projet au panier et déduit le crédit d’aperçu réservé.
Le paiement capture la remise ; une annulation, un échec ou un remboursement la rend de nouveau disponible pour cette création.

== Livraison eBook ==

Une commande eBook payée, y compris une commande dont les coupons ramènent le total à 0 €, déclenche la création du PDF privé. WooCommerce envoie ensuite un e-mail « Votre eBook est prêt » avec un lien temporaire et affiche un nouveau lien dans « Mes créations Calitiki ».
Si Render ou le stockage privé est momentanément indisponible, l’extension planifie une nouvelle tentative avec WP-Cron. Un remboursement révoque l’accès au fichier.
Le client peut renvoyer le message depuis « Mes créations Calitiki ». Les anciens PDF sont reconstruits automatiquement dans l’ordre de lecture numérique, sans nouvelle génération d’illustrations.

Le renvoi manuel ne dépend pas de la session de notifications de l’administration WordPress et toute erreur du moteur d’e-mail est journalisée sans interrompre le site.

Dans Mes créations Calitiki, chaque livre personnalisé propose aussi le bouton Lire mon livre interactif. Le passage signé par WooCommerce renouvelle la session privée du générateur avant d’ouvrir le projet acheté dans la liseuse.

== Portefeuille client ==

La rubrique « Mes crédits Calitiki » dans Mon compte affiche le solde, l’historique des achats, promotions, aperçus et restitutions techniques, ainsi qu’un bouton d’achat de crédits.
Dans le créateur, le solde est visible dès la connexion et toute dépense d’aperçu demande une confirmation explicite.
