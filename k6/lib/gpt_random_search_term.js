// gpt_k6_modules.js
/*global __VU, __ITER : true  */
import { randomSeed } from 'k6';

export function getRandomSearchTerm(dictionary, phraseLength) {
  const words = dictionary;
  let randomSeedParam = __VU * __ITER;
  let randWords = []
  for(var i = 1; i <= phraseLength; i++) {
    randomSeed(randomSeedParam + i);
    let randomWord = words[Math.floor(Math.random() * words.length)];
    randWords.push(randomWord)
  }
  return randWords.join('%20');
}
