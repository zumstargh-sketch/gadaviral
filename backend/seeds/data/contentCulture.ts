/** Cultural stories, language and food caption pools (all unique per index). */
const pick = <T,>(arr: readonly T[], i: number): T => arr[i % arr.length];

export const HISTORY = [
  'My grandmother used to tell us how our people settled along the coast long before Accra became a city. Sharing her stories here so the young ones can read them one day.',
  'A short thread on our coastal heritage: the forts, the fishing lore, and the family compounds that shaped who we are today.',
  'Did you know our traditional areas each keep their own oral histories? Ask your elders before those stories are lost.',
  'Our people were trading, fishing and building communities here centuries ago. Heritage is not museum material — it is family memory.',
  'I visited an old family house this weekend. The carved details alone hold generations of meaning. Document your family history, folks.',
  'Reading about the migration stories of our ancestors this evening. Every Ga and Dangme family carries one — what is yours?',
  'The wisdom in our proverbs deserves more attention. Post one proverb your elders always repeated and what it means.',
  'Cultural preservation starts at home. This month I am recording my uncle telling the stories he heard as a boy.',
  'Our festival calendar is basically a history book you can dance to. Learn the meaning before the drumming starts.',
  'A friendly reminder that our stools, symbols and family names carry history. Treat them with respect.',
  'Teaching my son the story of our lineage this weekend. He asked so many good questions. Proud moment.',
  'Heritage tip: write down the meanings of your family names and titles. Future generations will thank you.',
  'So much of our history lives in songs. Learn the words, not just the melody.',
  'Sharing a story my late aunt told about market days long ago. The discipline and order our traders had was remarkable.',
] as const;

export const LANGUAGE = [
  'Teaching my kids one new word every evening at dinner. This week: family titles. Which word should we learn next?',
  'Language challenge: use one sentence of your mother tongue with a friend today. Report back here!',
  'My daughter mixed English and Ga in one sentence today and it made my week. Bilingual kids are a blessing.',
  'Question for the elders: how do you politely greet an elderly person in the morning where you come from?',
  'Slowly rebuilding my vocabulary. Ten minutes of practice daily is better than one hour once a month.',
  'Diaspora parents: cartoons in English are everywhere, but our languages need deliberate effort. We do Sunday sessions at home.',
  'Proud moment: my nephew counted to twenty in our language without help. Small wins.',
  'Do you think our languages should be taught as full subjects in every school in our traditional areas?',
  'Learning to write in my mother tongue is harder than speaking it. The tones will humble you.',
  'Tip: label items in your house with their local names. It works for kids and adults.',
  'My grandmother only spoke her language to us growing up. I understand why now. Hold your mother tongue close and share a greeting below.',
  'Weekly practice thread: drop one sentence in your language, translate it, and let others learn.',
] as const;

export const FOOD = [
  'Sunday is not complete without kenkey, fried fish and shito. The pepper must be ground fresh — no shortcuts.',
  'Hot kenkey and fried fish this evening. Simple, perfect, home.',
  'My mother’s okro stew recipe has three secrets. I know two of them. Ask me nicely.',
  'Cooking for ten family members today and I am not even stressed. Practice from many festivals.',
  'Nothing beats fresh banku with pepper and grilled tilapia on a Friday night.',
  'Who else grew up eating gari soakings as an after-school snack? Raise your hand.',
  'My aunt makes the best abolo in the whole of Ada. This is not up for debate.',
  'Market day haul: fresh pepper, garden eggs, smoked fish, and one surprise gift from a trader who knows my face.',
  'Teaching my diaspora friends to eat kenkey properly. The look on their faces when the shito lands is priceless.',
  'Our soups deserve more international attention. Imagine a food festival dedicated to our traditional dishes.',
  'Homemade shito jar number four this month. My colleagues at work keep "borrowing" it.',
  'Breakfast debate: kenkey with fried fish, or with sardines and pepper? Choose wisely.',
] as const;

export const genHistory = (i: number) => pick(HISTORY, i);
export const genLanguage = (i: number) => pick(LANGUAGE, i);
export const genFood = (i: number) => pick(FOOD, i);
