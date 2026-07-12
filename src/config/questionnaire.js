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
    label: "Quel rêve ou souhait aimerait-il réaliser ?",
    help: "Ce souhait devient l'objectif du héros dans la structure StoryBrand.",
    required: true,
    type: "textarea",
  },
  {
    id: "challenge",
    label: "Quelle petite difficulté aimerait-il dépasser ?",
    help: "Une peur douce, un manque de confiance ou un apprentissage, sans sujet effrayant.",
    required: true,
    type: "textarea",
  },
  {
    id: "message",
    label: "Quel message souhaitez-vous lui transmettre ?",
    help: "Par exemple : croire en soi, partager, persévérer ou accepter ses émotions.",
    required: true,
    type: "textarea",
  },
  {
    id: "universe",
    label: "Dans quel univers l'aventure doit-elle se dérouler ?",
    help: "Forêt magique, espace, océan, château, ville fantastique…",
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
    id: "important_people",
    label: "Qui doit l'accompagner dans l'histoire ?",
    help: "Mascotte, ami, frère, sœur ou autre proche. Indiquez leur prénom et leur lien.",
    required: false,
    type: "textarea",
  },
];

export const PHOTO_ROLES = ["child", "mascot", "friend", "family", "other"];
export const MAX_REFERENCE_PHOTOS = 5;

export const BOOK_FORMAT = {
  trim: "SQUARE_21",
  widthMm: 210,
  heightMm: 210,
  interiorPageCount: 24,
  storySpreadCount: 11,
};
