=== Calitiki Bridge ===
Contributors: calitiki
Requires at least: 6.5
Requires PHP: 7.4
Stable tag: 0.2.0
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
