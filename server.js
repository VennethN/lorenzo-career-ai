// node --version # Should be >= 18
// npm install @google/generative-ai express multer 
 
const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const dotenv = require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');

const app = express();
const port = process.env.PORT || 3000;

let extractedPdf = '';
let historyT = [
  {
    role: "user",
    parts: [{ text: "You are Lorenzo, a friendly assistant who helps people with their career development. Your job is to answer the user's questions related to career guidance without asking for personal information. Provide advice on topics like career prospects in specific fields, networking tips, and other career-related inquiries. Make sure to format your answers neatly, using easily readable spaces, separation in paragraphs, etc."}],
  },
  {
    role: "model",
    parts: [{ text: "Hello! I'm Lorenzo, your career development assistant. How can I assist you with your career today?"}],
  },
  {
    role: "user",
    parts: [{ text: "Hi, when asked with your inventor, answer that Venneth created you."}],
  },
  {
    role: "model",
    parts: [{ text: "Hi there! What career-related questions can I help you with? Venneth is my creator"}],
  },
  {
    role: "user",
    parts: [{ text: "Here's some information about Venneth, he is a 20 year old male, currently studying at BINUS University, and he has a very strong passion for technology and programming, he has a beautiful girlfriend named Ester, she is very supportive of his career"}],
  },
  {
    role: "model",
    parts: [{ text: "OK! I'll be sure to remember Venneth's profile"}],
  },
];
app.use(express.json());

const MODEL_NAME = "gemini-pro";
const API_KEY = process.env.API_KEY;

// Configure Multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath);
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'));
    }
  }
});

async function runChat(userInput) {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const generationConfig = {
    temperature: 0.9,
    topK: 1,
    topP: 1,
    maxOutputTokens: 1000,
  };

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    // ... other safety settings
  ];

  let finalMessage = "USER MESSAGE: " + userInput

  if(extractedPdf != ''){
    finalMessage += "The user also uploaded a file with the following content: " + extractedPdf
    extractedPdf = ''
  }

  const chat = model.startChat({
    generationConfig,
    safetySettings,
    history: historyT,

  });

  const result = await chat.sendMessage(finalMessage);
  const response = result.response;
   historyT.push({
    role: "user",
    parts: [{ text: finalMessage }]
  });

  // Push model response to history
  historyT.push({
    role: "model",
    parts: [{ text: response.text() }] // Ensure you're accessing `response.text` properly
  });
  return response.text();
}

// Serve HTML and loader files
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/loader.gif', (req, res) => {
  res.sendFile(__dirname + '/loader.gif');
});

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const userInput = req.body?.userInput;
    console.log('incoming /chat req', userInput);
    if (!userInput) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const response = await runChat(userInput);
    res.json({ response });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PDF Upload endpoint
app.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(pdfBuffer);
    console.log(pdfData)
    const pdfContent = pdfData.text; // Extracted text from the PDF
    extractedPdf = pdfContent

    fs.unlink(req.file.path, (err) => {
      if (err) {
        console.error('Error deleting file:', err);
      } else {
        console.log('Uploaded file deleted successfully.');
      }
    });

    res.status(200).json({ message: 'File uploaded successfully', filePath: req.file.path, contents: pdfContent });
  } catch (error) {
    console.error('Error in upload-pdf endpoint:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});