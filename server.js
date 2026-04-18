const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json());

// Clients Setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Routes
app.get('/', (req, res) => res.send('VIRA Backend Live 🚀'));

// Main SOS Endpoint
app.post('/api/sos', upload.single('audio'), async (req, res) => {
    try {
        const { userId, latitude, longitude, timestamp } = req.body;
        const audioFile = req.file;

        if (!audioFile) return res.status(400).json({ error: 'No audio provided' });

        // 1. Upload Audio to Supabase Bucket 'EVIDENCE-VAULT'
        const fileName = `emergency_${Date.now()}.webm`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(process.env.STORAGE_BUCKET || 'EVIDENCE-VAULT')
            .upload(fileName, audioFile.buffer, { contentType: 'audio/webm' });

        if (uploadError) throw uploadError;

        // 2. Save Metadata to Database
        const { error: dbError } = await supabase
            .from('incidents')
            .insert([{ 
                user_id: userId, 
                lat: latitude, 
                lng: longitude, 
                audio_url: fileName,
                status: 'pending'
            }]);

        if (dbError) throw dbError;

        // 3. Optional: Gemini AI Analysis
        let aiSummary = "Analysis pending...";
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent([
                "Analyze this emergency audio for distress signals or specific threats.",
                { inlineData: { data: audioFile.buffer.toString("base64"), mimeType: "audio/webm" } }
            ]);
            aiSummary = result.response.text();
        } catch (aiErr) {
            console.log("AI Analysis failed, but data saved.");
        }

        res.status(200).json({ success: true, message: 'SOS Recorded', ai_analysis: aiSummary });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
