/** Contextual comment pools part A (spec §73). */
const pick = <T,>(arr: readonly T[], i: number): T => arr[i % arr.length];

export const COMMENTS_HISTORY = [
  'This is exactly the kind of history we need documented properly.',
  'My grandfather told a similar story — different town, same lesson.',
  'Please write a book when you have enough of these. I will be first in line.',
  'Which area is this from? I want to compare with my family’s version.',
  'I learned something today. Thank you for sharing.',
  'The elders really carried a lot of knowledge. We must record more of this.',
  'Interesting — I heard a slightly different version from my uncle in Tema.',
  'Bookmarked. Showing this to my children tonight.',
  'History like this should be taught in schools, not hidden in family memories.',
  'Respect. Our stories survive because people like you keep telling them.',
] as const;

export const COMMENTS_LANGUAGE = [
  'Ojekoo! Great initiative — language is identity.',
  'Is the tone high or low on the second syllable? Asking for my notes.',
  'We do Sunday practice too — consistency is everything.',
  'My two-year-old repeats everything now, this is the perfect age.',
  'Can you do one of these for greetings? That is where most people start.',
  'This motivated me to restart my lessons. Week one, day one.',
  'The kids mixing languages is how ours survived everywhere we went — keep going!',
  'We say it slightly differently in my village — both are valid I think.',
  'Tagging my cousin — this is the thread I told you about.',
  'Languages live when people use them daily. More of this please.',
] as const;

export const COMMENTS_FOOD = [
  'You cannot post this without location and price. Rules of the internet!',
  'The shito recipe is safe with you? Asking for the whole diaspora.',
  'Come and see, my mouth is now watering at work.',
  'Fresh ground pepper makes all the difference. No blender shortcuts!',
  'This is my Sunday plan sorted, thank you.',
  'Where exactly? I will be there this weekend, hungry already.',
  'My mother says her version is better. Every mother says that. Every mother is right.',
  'Save me a plate for Christmas, I am booking in advance.',
  'Kenkey fans checking in — this looks legit.',
  'I can smell this post through the screen.',
] as const;

export const COMMENTS_DIASPORA = [
  'This resonates deeply. Second-generation parenting is a beautiful challenge.',
  'December flights are already crazy expensive — book early everyone!',
  'Your community group sounds amazing. How did you find the first members?',
  'The barrel list is a whole comedy series. Mine asked for four types of soap.',
  'Keep it up — the children will thank you when they are older.',
  'Which area are you in? We might have a meetup you can join.',
  'Identity travels with you when you carry it deliberately. Well done.',
  'I teach my kids at bath time — five words a day. It adds up.',
  'Nothing beats that first Sunday back home. Enjoy every minute.',
  'Culture does not need a postcode. Well said.',
] as const;
