export const BOOK_QUESTIONS = [
  {
    id: "hero_name",
    label: "Comment s'appelle l'enfant ?",
    help: "Le prénom qui apparaîtra dans l'histoire.",
    required: true,
    type: "text",
  },
  {
    id: "age",
    label: "Quel âge a l'enfant ?",
    help: "Cela adapte la longueur des phrases et le vocabulaire.",
    required: true,
    type: "number",
  },
  {
    id: "favorite_activities",
    label: "Qu'est-ce qu'il ou elle adore faire ?",
    help: "Jeux, passions, animaux, musique, sport ou activité favorite.",
    required: true,
    type: "textarea",
  },
  {
    id: "personality",
    label: "Quels mots décrivent le mieux l'enfant ?",
    help: "Par exemple : curieux, drôle, sensible, courageux ou rêveur.",
    required: true,
    type: "textarea",
  },
  {
    id: "dream",
    label: "Quel objectif lui donnera envie d'avancer ?",
    help: "Ce souhait devient l'objectif concret du héros.",
    required: true,
    type: "textarea",
  },
  {
    id: "challenge",
    label: "Qu'est-ce qui pourrait le faire hésiter ?",
    help: "Une peur ou un doute protecteur, jamais présenté comme un défaut.",
    required: true,
    type: "textarea",
  },
  {
    id: "message",
    label: "Qu'aimeriez-vous qu'il découvre grâce à ses essais ?",
    help: "Par exemple : chaque tentative me fait avancer.",
    required: true,
    type: "textarea",
  },
  {
    id: "signature_object",
    label: "Quel objet spécial doit accompagner l'enfant ?",
    help: "Un doudou, un sac, une couverture, un instrument ou un objet inventé.",
    required: false,
    type: "text",
  },
  {
    id: "universe",
    label: "Dans quel univers l'aventure doit-elle se dérouler ?",
    help: "Forêt magique, espace, océan, château, ville fantastique…",
    required: true,
    type: "textarea",
  },
];

export const PHOTO_ROLES = ["child", "mascot", "friend", "family", "other"];
export const PHOTO_STORY_ROLES = ["hero", "guide", "ally", "companion", "supporter", "guest"];
export const DEFAULT_STORY_ROLE_BY_PHOTO_ROLE = {
  child: "hero",
  mascot: "companion",
  friend: "ally",
  family: "guide",
  other: "guest",
};
export const MAX_REFERENCE_PHOTOS = 5;

export const BOOK_FORMAT = {
  trim: "SQUARE_21",
  widthMm: 210,
  heightMm: 210,
  interiorPageCount: 24,
  storySpreadCount: 11,
};
