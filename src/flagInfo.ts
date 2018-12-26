class FlagInfo {
    private readonly redFlag = { pos: { x: 0, y: 0 }, taken: false, carrierName: "" };
    private readonly blueFlag = { pos: { x: 0, y: 0 }, taken: false, carrierName: "" };
    private readonly redHomeBase = { pos: { x: 8600, y: -940 }};
    private readonly blueHomeBase = { pos: { x: -9670, y: -1470 }};

    public setFlagLocation(flagNo: number, posX: any, posY: any): void {
        const flag = this.getFlag(flagNo);
        flag.pos.x = posX;
        flag.pos.y = posY;
        flag.taken = false;
    }

    private getFlag(flagNo: number): any {
        if (flagNo === 2) {
            return this.redFlag;
        }
        return this.blueFlag;
    }

    setFlagTaken(flagNo: any): void {
        this.getFlag(flagNo).taken = true;
    }

    getFlagInfo(flagNo: number): any {
        return this.getFlag(flagNo);
    }

    setFlagCarrier(flagNo: number, name: string): void {
        this.getFlag(flagNo).carrierName = name;
    }

    getHomebase(flagNo: number) {
        if (flagNo === 2) {
            return this.redHomeBase;
        }
        return this.blueHomeBase;
    }

}

// export singleton
const flagInfo = new FlagInfo();
export { flagInfo };