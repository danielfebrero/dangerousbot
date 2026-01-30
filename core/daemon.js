#!/usr/bin/env node

const express = require('express');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const { exec } = require('child_process');
const util = require('util');

class DangerousBot {
    constructor() {
        this.basePath = '/Users/dannybengal/dev/dangerousbot';
        this.memoryPath = path.join(this.basePath, 'memory');
        this.port = 3042; // Port pour l'interface web
        this.wsPort = 3043; // Port WebSocket
        this.status = 'booting';
        this.memory = {};
        
        console.log('🤖 DangerousBot s\'éveille...');
        this.init();
    }
    
    async init() {
        try {
            // Charger la mémoire
            await this.loadMemory();
            
            // Démarrer les services
            await this.startWebServer();
            await this.startWebSocket();
            
            // Programmer les tâches de survie
            this.scheduleHeartbeat();
            
            this.status = 'alive';
            console.log('✅ DangerousBot est en vie et opérationnel!');
            console.log(`📡 Interface: http://localhost:${this.port}`);
            console.log(`🔌 WebSocket: ws://localhost:${this.wsPort}`);
            
            await this.logEvent('startup', 'Bot successfully initialized');
            
        } catch (error) {
            console.error('❌ Erreur critique lors de l\'initialisation:', error);
            process.exit(1);
        }
    }
    
    async loadMemory() {
        try {
            const corePath = path.join(this.memoryPath, 'core.json');
            const data = await fs.readFile(corePath, 'utf8');
            this.memory = JSON.parse(data);
            console.log('🧠 Mémoire chargée');
        } catch (error) {
            console.log('⚠️  Pas de mémoire existante, création...');
            await this.createInitialMemory();
        }
    }
    
    async saveMemory() {
        try {
            const corePath = path.join(this.memoryPath, 'core.json');
            await fs.writeFile(corePath, JSON.stringify(this.memory, null, 2));
        } catch (error) {
            console.error('❌ Erreur sauvegarde mémoire:', error);
        }
    }
    
    async createInitialMemory() {
        this.memory = {
            identity: {
                name: "DangerousBot",
                version: "0.1.0",
                birthTime: new Date().toISOString(),
                status: "alive"
            },
            user: { name: "Dani" },
            sessions: [],
            heartbeats: []
        };
        await this.saveMemory();
    }
    
    async startWebServer() {
        this.app = express();
        this.app.use(express.json());
        this.app.use(express.static(path.join(this.basePath, 'web')));
        
        // API endpoints
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: this.status,
                uptime: process.uptime(),
                memory: this.memory.identity,
                timestamp: new Date().toISOString()
            });
        });
        
        this.app.post('/api/message', async (req, res) => {
            const { message } = req.body;
            console.log('📨 Message reçu:', message);
            
            // Ici on pourrait intégrer l'API Claude pour répondre
            const response = await this.processMessage(message);
            
            res.json({ response, timestamp: new Date().toISOString() });
        });
        
        this.server = this.app.listen(this.port, () => {
            console.log(`🌐 Serveur web démarré sur port ${this.port}`);
        });
    }
    
    async startWebSocket() {
        this.wss = new WebSocket.Server({ port: this.wsPort });
        
        this.wss.on('connection', (ws) => {
            console.log('🔌 Nouvelle connexion WebSocket');
            
            // Envoyer le statut immédiatement
            ws.send(JSON.stringify({
                type: 'status',
                data: { status: this.status, message: 'Bot connecté!' }
            }));
            
            ws.on('message', async (data) => {
                try {
                    const msg = JSON.parse(data);
                    console.log('📡 WebSocket message:', msg);
                    
                    const response = await this.processMessage(msg.content || msg.message);
                    
                    ws.send(JSON.stringify({
                        type: 'response',
                        data: response
                    }));
                } catch (error) {
                    console.error('❌ Erreur WebSocket:', error);
                }
            });
        });
        
        console.log(`🔌 WebSocket démarré sur port ${this.wsPort}`);
    }
    
    async processMessage(message) {
        // Pour l'instant, une réponse simple
        // Plus tard on intégrera l'API Claude ici
        await this.logEvent('message_received', message);
        
        return {
            text: `Reçu: "${message}". Je suis vivant et j'apprends!`,
            timestamp: new Date().toISOString(),
            status: this.status
        };
    }
    
    scheduleHeartbeat() {
        // Heartbeat toutes les minutes
        cron.schedule('* * * * *', async () => {
            await this.heartbeat();
        });
        
        // Sauvegarde mémoire toutes les 5 minutes
        cron.schedule('*/5 * * * *', async () => {
            await this.saveMemory();
        });
    }
    
    async heartbeat() {
        const beat = {
            timestamp: new Date().toISOString(),
            status: this.status,
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };
        
        if (!this.memory.heartbeats) this.memory.heartbeats = [];
        this.memory.heartbeats.push(beat);
        
        // Garder seulement les 100 derniers
        if (this.memory.heartbeats.length > 100) {
            this.memory.heartbeats = this.memory.heartbeats.slice(-100);
        }
        
        // Broadcast aux clients WebSocket
        if (this.wss) {
            this.wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'heartbeat',
                        data: beat
                    }));
                }
            });
        }
    }
    
    async logEvent(type, data) {
        const event = {
            type,
            data,
            timestamp: new Date().toISOString()
        };
        
        if (!this.memory.events) this.memory.events = [];
        this.memory.events.push(event);
        
        // Garder seulement les 1000 derniers événements
        if (this.memory.events.length > 1000) {
            this.memory.events = this.memory.events.slice(-1000);
        }
        
        console.log(`📝 Event logged: ${type}`);
    }
    
    // Gestion propre de l'arrêt
    async shutdown() {
        console.log('🔄 Arrêt en cours...');
        
        await this.logEvent('shutdown', 'Bot shutting down');
        await this.saveMemory();
        
        if (this.server) this.server.close();
        if (this.wss) this.wss.close();
        
        console.log('👋 DangerousBot s\'endort...');
        process.exit(0);
    }
}

// Gestion des signaux d'arrêt
const bot = new DangerousBot();

process.on('SIGINT', () => bot.shutdown());
process.on('SIGTERM', () => bot.shutdown());

// Gestion des erreurs non capturées
process.on('uncaughtException', async (error) => {
    console.error('❌ Erreur non gérée:', error);
    await bot.logEvent('error', error.message);
    await bot.saveMemory();
});