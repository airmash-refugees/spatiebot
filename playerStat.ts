class PlayerStat {
    public id: number;

    private hitMe: number = 0;
    private lastHit: number = 0;

    constructor(id: number) {
        this.id = id;
    }

    public addHit() {
        this.lastHit = Date.now();
        this.hitMe += 1;
    }

    public get isAgressive(): boolean {
        const lastHitDelta = Date.now() - this.lastHit;
        // if the last hit was more than 2 minutes ago, it was probably an accident
        if (lastHitDelta > 2 * 60 * 1000) {
            return false;
        }

        return this.hitMe > 2;
    }

}
export { PlayerStat };