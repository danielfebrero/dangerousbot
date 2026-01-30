/**
 * system.ts - Analyse de l'environnement pour DangerousBot
 * Permet de comprendre la machine sur laquelle il s'exécute
 */
import { BasicSystemInfo, DiskSpace, NetworkStatus, ToolsAvailability, SystemReport } from './types';
export declare class System {
    private basePath;
    constructor(basePath: string);
    private formatBytes;
    private formatUptime;
    getBasicInfo(): BasicSystemInfo;
    checkTools(): ToolsAvailability;
    getSafeEnvVars(): Record<string, string>;
    getDiskSpace(): DiskSpace | null;
    checkNetwork(): Promise<NetworkStatus>;
    getTopProcesses(): string | null;
    getFullReport(): Promise<SystemReport>;
    getSummary(): Promise<string>;
}
//# sourceMappingURL=system.d.ts.map