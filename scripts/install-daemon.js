#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

class DaemonInstaller {
    constructor() {
        this.botPath = '/Users/dannybengal/dev/dangerousbot';
        this.plistPath = '/Users/dannybengal/Library/LaunchAgents/com.dangerousbot.daemon.plist';
        this.logPath = path.join(this.botPath, 'logs');
    }
    
    async install() {
        console.log('🔧 Installation du démon DangerousBot...');
        
        try {
            // Créer le dossier logs
            await fs.mkdir(this.logPath, { recursive: true });
            console.log('📁 Dossier logs créé');
            
            // Créer le plist pour launchd (macOS)
            await this.createPlist();
            console.log('📋 Configuration démon créée');
            
            // Charger le démon
            await this.loadDaemon();
            console.log('🚀 Démon chargé');
            
            // Démarrer immédiatement
            await this.startDaemon();
            console.log('✅ DangerousBot est maintenant 24/7!');
            
            console.log('');
            console.log('🎯 Interface disponible sur: http://localhost:3042');
            console.log('🔌 WebSocket sur: ws://localhost:3043');
            console.log('');
            console.log('Commandes utiles:');
            console.log('- Arrêter: launchctl unload ' + this.plistPath);
            console.log('- Redémarrer: launchctl unload ' + this.plistPath + ' && launchctl load ' + this.plistPath);
            console.log('- Status: launchctl list | grep dangerousbot');
            
        } catch (error) {
            console.error('❌ Erreur installation:', error);
            process.exit(1);
        }
    }
    
    async createPlist() {
        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dangerousbot.daemon</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${this.botPath}/core/daemon.js</string>
    </array>
    
    <key>WorkingDirectory</key>
    <string>${this.botPath}</string>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    
    <key>StandardOutPath</key>
    <string>${this.logPath}/stdout.log</string>
    
    <key>StandardErrorPath</key>
    <string>${this.logPath}/stderr.log</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    
    <key>ProcessType</key>
    <string>Background</string>
    
    <key>Nice</key>
    <integer>5</integer>
    
</dict>
</plist>`;
        
        await fs.writeFile(this.plistPath, plistContent);
    }
    
    async loadDaemon() {
        try {
            // Décharger d'abord si déjà chargé
            await execAsync(`launchctl unload ${this.plistPath}`);
        } catch (error) {
            // Ignore si pas déjà chargé
        }
        
        // Charger le nouveau démon
        await execAsync(`launchctl load ${this.plistPath}`);
    }
    
    async startDaemon() {
        try {
            await execAsync(`launchctl start com.dangerousbot.daemon`);
        } catch (error) {
            console.log('⚠️  Démon peut-être déjà démarré:', error.message);
        }
        
        // Attendre un peu puis vérifier
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            const { stdout } = await execAsync('launchctl list | grep dangerousbot');
            console.log('✅ Démon actif:', stdout.trim());
        } catch (error) {
            console.log('⚠️  Vérification status échouée');
        }
    }
    
    async checkStatus() {
        try {
            const { stdout } = await execAsync('launchctl list com.dangerousbot.daemon');
            console.log('Status démon:', stdout);
        } catch (error) {
            console.log('❌ Démon pas trouvé');
        }
    }
}

// Script principal
if (require.main === module) {
    const installer = new DaemonInstaller();
    
    const command = process.argv[2];
    
    switch (command) {
        case 'install':
            installer.install();
            break;
        case 'status':
            installer.checkStatus();
            break;
        default:
            console.log('Usage: node install-daemon.js [install|status]');
    }
}