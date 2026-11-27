// Quote of the day for the Home note (George, 2026-11-26): salesmanship, grit and self-mastery from the greats.
// The list cycles forever: one quote a day, a different starting point for each agent. Only quotes with a solid
// source or a long, standard attribution are here; misattributed favourites are left out on purpose.

export type QuoteTheme = 'perseverance' | 'wisdom' | 'patience' | 'success' | 'mindset';
export const QUOTE_THEMES: [QuoteTheme, string][] = [['perseverance', 'Perseverance'], ['wisdom', 'Wisdom'], ['patience', 'Patience'], ['success', 'Chasing success'], ['mindset', 'Positive mindset']];
export interface Quote { text: string; by: string; t: QuoteTheme }

export const QUOTES: Quote[] = [
  { text: 'Whatever the mind of man can conceive and believe, it can achieve.', by: 'Napoleon Hill', t: 'mindset' },
  { text: 'Every adversity, every failure, every heartache carries with it the seed of an equal or greater benefit.', by: 'Napoleon Hill', t: 'perseverance' },
  { text: 'Patience, persistence and perspiration make an unbeatable combination for success.', by: 'Napoleon Hill', t: 'patience' },
  { text: 'Well done is better than well said.', by: 'Benjamin Franklin', t: 'success' },
  { text: 'Diligence is the mother of good luck.', by: 'Benjamin Franklin', t: 'success' },
  { text: 'Lost time is never found again.', by: 'Benjamin Franklin', t: 'wisdom' },
  { text: 'Never leave that till tomorrow which you can do today.', by: 'Benjamin Franklin', t: 'success' },
  { text: 'The impediment to action advances action. What stands in the way becomes the way.', by: 'Marcus Aurelius', t: 'perseverance' },
  { text: 'Waste no more time arguing about what a good man should be. Be one.', by: 'Marcus Aurelius', t: 'wisdom' },
  { text: 'Very little is needed to make a happy life; it is all within yourself, in your way of thinking.', by: 'Marcus Aurelius', t: 'mindset' },
  { text: 'It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.', by: 'Seneca', t: 'mindset' },
  { text: 'While we are postponing, life speeds by.', by: 'Seneca', t: 'wisdom' },
  { text: 'First say to yourself what you would be; and then do what you have to do.', by: 'Epictetus', t: 'success' },
  { text: 'No man is free who is not master of himself.', by: 'Epictetus', t: 'wisdom' },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', by: 'Will Durant, on Aristotle', t: 'success' },
  { text: 'The journey of a thousand miles begins with a single step.', by: 'Lao Tzu', t: 'patience' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', by: 'Confucius', t: 'patience' },
  { text: 'In the midst of chaos, there is also opportunity.', by: 'Sun Tzu', t: 'wisdom' },
  { text: 'You can make more friends in two months by becoming interested in other people than you can in two years by trying to get other people interested in you.', by: 'Dale Carnegie', t: 'wisdom' },
  { text: 'Remember that a person’s name is to that person the sweetest and most important sound in any language.', by: 'Dale Carnegie', t: 'wisdom' },
  { text: 'You can have everything in life you want, if you will just help enough other people get what they want.', by: 'Zig Ziglar', t: 'success' },
  { text: 'Every sale has five basic obstacles: no need, no money, no hurry, no desire, no trust.', by: 'Zig Ziglar', t: 'wisdom' },
  { text: 'People often say that motivation doesn’t last. Well, neither does bathing. That’s why we recommend it daily.', by: 'Zig Ziglar', t: 'mindset' },
  { text: 'Timid salesmen have skinny kids.', by: 'Zig Ziglar', t: 'success' },
  { text: 'Discipline is the bridge between goals and accomplishment.', by: 'Jim Rohn', t: 'success' },
  { text: 'Either you run the day or the day runs you.', by: 'Jim Rohn', t: 'success' },
  { text: 'Success is nothing more than a few simple disciplines, practiced every day.', by: 'Jim Rohn', t: 'success' },
  { text: 'We become what we think about.', by: 'Earl Nightingale', t: 'mindset' },
  { text: 'I will persist until I succeed.', by: 'Og Mandino', t: 'perseverance' },
  { text: 'It is in your moments of decision that your destiny is shaped.', by: 'Tony Robbins', t: 'mindset' },
  { text: 'Approach each customer with the idea of helping him or her to solve a problem or achieve a goal, not of selling a product or service.', by: 'Brian Tracy', t: 'wisdom' },
  { text: 'People don’t like to be sold, but they love to buy.', by: 'Jeffrey Gitomer', t: 'wisdom' },
  { text: 'Success is your duty, obligation, and responsibility.', by: 'Grant Cardone', t: 'success' },
  { text: 'The key is not to prioritize what’s on your schedule, but to schedule your priorities.', by: 'Stephen Covey', t: 'wisdom' },
  { text: 'Change your thoughts and you change your world.', by: 'Norman Vincent Peale', t: 'mindset' },
  { text: 'Pretend that every single person you meet has a sign around his or her neck that says, “Make me feel important.”', by: 'Mary Kay Ash', t: 'wisdom' },
  { text: 'There is only one boss. The customer.', by: 'Sam Walton', t: 'wisdom' },
  { text: 'Luck is a dividend of sweat. The more you sweat, the luckier you get.', by: 'Ray Kroc', t: 'success' },
  { text: 'It takes 20 years to build a reputation and five minutes to ruin it.', by: 'Warren Buffett', t: 'patience' },
  { text: 'Don’t be afraid to give up the good to go for the great.', by: 'John D. Rockefeller', t: 'success' },
  { text: 'Genius is one percent inspiration and ninety-nine percent perspiration.', by: 'Thomas Edison', t: 'perseverance' },
  { text: 'Whether you think you can, or you think you can’t, you’re right.', by: 'Henry Ford', t: 'mindset' },
  { text: 'The only way to do great work is to love what you do.', by: 'Steve Jobs', t: 'success' },
  { text: 'The way to get started is to quit talking and begin doing.', by: 'Walt Disney', t: 'success' },
  { text: 'Do what you can, with what you have, where you are.', by: 'Theodore Roosevelt', t: 'perseverance' },
  { text: 'Far and away the best prize that life offers is the chance to work hard at work worth doing.', by: 'Theodore Roosevelt', t: 'success' },
  { text: 'Always bear in mind that your own resolution to succeed is more important than any other one thing.', by: 'Abraham Lincoln', t: 'mindset' },
  { text: 'Never give in, never, never, never.', by: 'Winston Churchill', t: 'perseverance' },
  { text: 'Nothing in this world can take the place of persistence. Talent will not; nothing is more common than unsuccessful men with talent.', by: 'Calvin Coolidge', t: 'perseverance' },
  { text: 'Success is to be measured not so much by the position that one has reached in life as by the obstacles which he has overcome.', by: 'Booker T. Washington', t: 'perseverance' },
  { text: 'Alone we can do so little; together we can do so much.', by: 'Helen Keller', t: 'wisdom' },
  { text: 'You must do the thing you think you cannot do.', by: 'Eleanor Roosevelt', t: 'mindset' },
  { text: 'If you can’t fly then run, if you can’t run then walk, if you can’t walk then crawl, but whatever you do you have to keep moving forward.', by: 'Martin Luther King Jr.', t: 'perseverance' },
  { text: 'Do the thing and you will have the power.', by: 'Ralph Waldo Emerson', t: 'mindset' },
  { text: 'Don’t let what you cannot do interfere with what you can do.', by: 'John Wooden', t: 'mindset' },
  { text: 'You miss 100% of the shots you don’t take.', by: 'Wayne Gretzky', t: 'success' },
  { text: 'Don’t quit. Suffer now and live the rest of your life as a champion.', by: 'Muhammad Ali', t: 'perseverance' },
  { text: 'I’ve failed over and over and over again in my life. And that is why I succeed.', by: 'Michael Jordan', t: 'perseverance' },
  { text: 'Winners never quit and quitters never win.', by: 'Vince Lombardi', t: 'perseverance' },
  { text: 'He that can have patience can have what he will.', by: 'Benjamin Franklin', t: 'patience' },
  { text: 'Adopt the pace of nature: her secret is patience.', by: 'Ralph Waldo Emerson', t: 'patience' },
  { text: 'The two most powerful warriors are patience and time.', by: 'Leo Tolstoy', t: 'patience' },
  { text: 'Patience is bitter, but its fruit is sweet.', by: 'Jean-Jacques Rousseau', t: 'patience' },
  { text: 'Nature does not hurry, yet everything is accomplished.', by: 'Lao Tzu', t: 'patience' },
  { text: 'Rivers know this: there is no hurry. We shall get there some day.', by: 'A. A. Milne', t: 'patience' },
  { text: 'An investment in knowledge pays the best interest.', by: 'Benjamin Franklin', t: 'wisdom' },
  { text: 'The art of being wise is the art of knowing what to overlook.', by: 'William James', t: 'wisdom' },
  { text: 'Seek first to understand, then to be understood.', by: 'Stephen Covey', t: 'wisdom' },
  { text: 'Most people do not listen with the intent to understand; they listen with the intent to reply.', by: 'Stephen Covey', t: 'wisdom' },
  { text: 'Have more than thou showest, speak less than thou knowest.', by: 'William Shakespeare', t: 'wisdom' },
  { text: 'The happiness of your life depends upon the quality of your thoughts.', by: 'Marcus Aurelius', t: 'mindset' },
  { text: 'Optimism is the faith that leads to achievement.', by: 'Helen Keller', t: 'mindset' },
];

/**
 * Today's quote. The five themes take turns day by day (perseverance, wisdom, patience, chasing success, positive
 * mindset), and each theme walks its own quotes in order and starts over, forever. Each agent starts at their own place.
 */
export function quoteOfDay(y: number, m: number, d: number, agent = ''): Quote & { theme: string } {
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  let h = 0; for (const ch of agent) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [t, theme] = QUOTE_THEMES[(day + h) % QUOTE_THEMES.length];
  const pool = QUOTES.filter(q => q.t === t);
  return { ...pool[(Math.floor(day / QUOTE_THEMES.length) + h) % pool.length], theme };
}
