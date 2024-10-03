const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const OpenAI = require('openai');
const sentences = require('./sentences.js');
const openai = new OpenAI({ apiKey: process.env.GENERATE_IMAGES_OPENAI_API_KEY });


// Function to process each word sequentially
async function processWords() {
  let errorCount = 0;

  for (const sentenceObject of sentences) {
    try {
      await generateAndSaveImage(sentenceObject);
      errorCount = 0; 
    } catch (error) {
      errorCount++;
      if (errorCount > 3) {
        console.error('More than 3 consecutive errors. Stopping the process.');
        break;
      }
    }
  }
}
// Function to call DALL-E API and save the image
async function generateAndSaveImage(sentenceObject) {
  try {
    const sentence = sentenceObject.sentence;

    const base64Image = await generateBase64Image(sentence);
    const filename = sanitizeFilename(sentence).substring(0, 60) + '.jpg';

    await uploadImage(filename, base64Image);
    const front = generateFlashcardFront(sentence, sentenceObject.baseWords);
    const back = generateFlashcardBack(sentence, sentenceObject.baseWords, sentenceObject.replacedWords);

    await addCardWithImage(filename, front, back);
    console.log(`Generated image for: ${sentenceObject.sentence}`);

  } catch (error) {
    console.error(`Failed to generate image for ${sentenceObject.sentence}: ${error.message}`);
    throw error; 
  }
}

async function generateBase64Image(word) {
  let prompt = promptTemplate + word; 
  const response = await openai.images.generate({ model: "dall-e-3", prompt: prompt });

  if (!response.data || !response.data[0] || !response.data[0].url) {
    throw new Error(`Image URL not found in the response for word: ${word}`);
  }

  const imageUrl = response.data[0].url;
  const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });

  if (!imageResponse.data) {
    throw new Error(`Image response is empty for word: ${word} - ${imageUrl}`);
  }

  const buffer = Buffer.from(imageResponse.data, 'binary');

  const processedBuffer = await sharp(buffer)
    .resize(512, 512)
    .jpeg({ quality: 80 })
    .toBuffer();

  return processedBuffer.toString('base64');
}

const promptTemplate = `I am learning English, so I'd like you to generate images. 

I will send you term. You should visualize a term as a picture, which I will put on a flashcard. This term should be visualized as a situation or a thing in the picture. 

The picture should show:
- People or situation in IT corporate / digital product company environment
- Be photorealistic, look like a photograph
- Under any circumstances you cannot put any words, logos, symbols, emblems, icons, texts, or languages on the picture
- If there is a question, do not answer question - generate image.

The sentence is: 
`;



async function uploadImage(filename, imageData) {
  const response = await fetch("http://127.0.0.1:8765", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "storeMediaFile",
      version: 6,
      params: {
        filename: filename,
        data: imageData
      }
    })
  });

  const result = await response.json();
  return result;
}

async function addCardWithImage(imageFilename, front, back) {
  const card = {
    note: {
      deckName: "Angielski - Złożone słownictwo",
      modelName: "Basic",
      fields: {
        Front: `${front}<br/><img src="${imageFilename}" alt="Description of the image">`,
        Back: back
      },
      tags: ["myTag"],
      options: {
        allowDuplicate: false
      }
    }
  };

  const response = await fetch("http://127.0.0.1:8765", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "addNote",
      version: 6,
      params: card
    })
  });
}

function generateFlashcardFront(sentence, baseWord) {
  const regex = new RegExp(`\\b${baseWord}\\b`, 'gi');
  return sentence.replace(regex, `<b>${baseWord}</b>`);
}

function generateFlashcardBack(sentence, baseWord, replacedWord) {
  const regex = new RegExp(`\\b${baseWord}\\b`, 'gi');
  return sentence.replace(regex, `<b>${replacedWord}</b>`);
}

function sanitizeFilename(word) {
  const charMap = {
      'à': 'a',
      'è': 'e',
      'é': 'e',
      'ì': 'i',
      'ò': 'o',
      'ù': 'u'
  };

  // Replace Italian characters and remove dots, commas, question marks
  return word
      .replace(/[àèéìòù]/g, char => charMap[char])
      .replace(/[.,?'"\/]/g, '') // Replace problematic characters
      .replace(/ /g, '_'); // Replace spaces with underscores for better filename compatibility
}

// Start the image generation process
processWords();
