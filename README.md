# Lire l'anglais — version 1.0

Coller un texte en anglais, l'écouter lu avec fluidité, puis le lire en français.

## Ce qu'elle fait

- **📋 Coller** : récupère le texte copié (ou appui long dans la zone → Coller).
- **▶︎ Écouter** : lecture phrase par phrase par la voix du téléphone, avec la
  phrase en cours surlignée. Pause et arrêt à tout moment.
- **Traduire en français** : deux vues.
  - *Phrase par phrase* : chaque phrase anglaise avec sa traduction dessous et
    son propre bouton 🔊 pour la réécouter seule.
  - *Texte entier* : la traduction d'un bloc, à copier ou à écouter en français.
- **Menu ⋯** : choix de la voix anglaise, vitesse, petite pause entre les phrases.
  Les réglages et le dernier texte sont gardés sur le téléphone.

## Pour une voix vraiment fluide (iPhone)

Réglages → Accessibilité → Contenu énoncé → Voix → Anglais : téléchargez une
voix « Améliorée » ou « Premium ». L'appli la place automatiquement en tête de liste.

## Traduction

Gratuite, sans clé ni compte. L'appli interroge le service public de Google
Traduction ; s'il ne répond pas, elle passe à MyMemory. Il faut du réseau pour
traduire — la lecture à voix haute, elle, marche hors ligne.

## Mettre en ligne

Nouveau dépôt GitHub, les huit fichiers à la racine, puis sur Vercel :
*Add New → Project*, importez le dépôt, ne remplissez aucun champ, Deploy.
Ouvrez l'adresse sur le téléphone, Partager → Sur l'écran d'accueil.
L'icône est violette avec « En » et des ondes jaunes.

## Version

Le numéro s'affiche dans le menu « ⋯ ». Il vit dans `APP_VERSION` (`app.js`) et
dans le nom du cache (`sw.js`) ; les deux sont incrémentés à chaque correction.
L'appli vérifie d'elle-même s'il existe une version plus récente et se recharge.
