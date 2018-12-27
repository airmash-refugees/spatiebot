import { Grid, BestFirstFinder, Util } from "pathfinding";

const navConfig = {
    // map is -16352 to 16352 in the x direction and -8160 to 8160 in the y-direction
    mapProperties: { left: -16352, top: -8160, right: 16352, bottom: 8160 },
    maxGridLength: 2500,
    marginStep: 500,
    scale: 0.25
};

class BotNavigation {
    private mountains;
    private log: (what: string) => void;
    private signalAlive: () => void;

    setLogFunction(logFunction: (what: string) => void) {
        this.log = logFunction;
    }

    setSignalAliveFunction(signalAlive: () => void): any {
        this.signalAlive = signalAlive;
    }

    setMountains(mountains: { x: number, y: number, size: number }[]): void {
        this.mountains = mountains.map(m => {
            return {
                x: m.x * navConfig.scale,
                y: m.y * navConfig.scale,
                size: m.size * navConfig.scale,
            };
        });

    }

    private getGrid(width: number, height: number, left: number, top: number): Grid {

        const grid = new Grid(Math.ceil(width), Math.ceil(height));

        this.mountains.forEach(mountain => {
            if (mountain.x < left - mountain.size || mountain.x > left + width + mountain.size) {
                return;
            }
            if (mountain.y < top - mountain.size || mountain.y > top + height + mountain.size) {
                return;
            }

            // remove walkability of this mountain
            const mountainLeft = mountain.x - mountain.size;
            const mountainRight = mountain.x + mountain.size;
            const mountainTop = mountain.y - mountain.size;
            const mountainBottom = mountain.y + mountain.size;
            for (let i = mountainLeft; i <= mountainRight; i++) {
                for (let j = mountainTop; j <= mountainBottom; j++) {
                    const gridX = Math.floor(i - left);
                    const gridY = Math.floor(j - top);
                    if (gridX < 0 || gridX >= width || gridY < 0 || gridY >= height) {
                        continue;
                    }
                    grid.setWalkableAt(gridX, gridY, false);
                }
            }
        });

        return grid;
    }

    private isValid(pos: { x: number, y: number }): boolean {
        const margin = 32 * navConfig.scale;
        return pos.x > navConfig.mapProperties.left * navConfig.scale + margin &&
            pos.x < navConfig.mapProperties.right * navConfig.scale - margin &&
            pos.y > navConfig.mapProperties.top * navConfig.scale + margin &&
            pos.y < navConfig.mapProperties.bottom * navConfig.scale - margin;
    }

    private scale(pos: any): { x: number, y: number, scale: number } {
        if (pos.scale) {
            // has already been scaled
            return pos;
        }
        return {
            x: pos.x * navConfig.scale,
            y: pos.y * navConfig.scale,
            scale: navConfig.scale
        };
    }

    public findPath(myPos: { x: number, y: number }, otherPos: { x: number, y: number }, requestID: number, margin: number = 0) {
        this.signalAlive();

        myPos = this.scale(myPos);
        otherPos = this.scale(otherPos);

        if (!this.isValid(myPos) || !this.isValid(otherPos)) {
            this.log("not valid for " + requestID);
            return [];
        }

        const halvarin = margin / 2;

        let gridLeft: number;
        const gridWidth = Math.min(navConfig.maxGridLength, Math.abs(otherPos.x - myPos.x) + margin);
        if (otherPos.x > myPos.x) {
            gridLeft = myPos.x - halvarin;
        } else {
            gridLeft = myPos.x - gridWidth + 1 + halvarin;
        }

        if (gridLeft < navConfig.mapProperties.left * navConfig.scale) {
            gridLeft = navConfig.mapProperties.left * navConfig.scale;
        }
        if (gridLeft + gridWidth > navConfig.mapProperties.right * navConfig.scale) {
            gridLeft = navConfig.mapProperties.right * navConfig.scale - gridWidth - 1;
        }

        let gridTop: number;
        const gridHeight = Math.min(navConfig.maxGridLength, Math.abs(otherPos.y - myPos.y) + margin);
        if (otherPos.y > myPos.y) {
            gridTop = myPos.y - halvarin;
        } else {
            gridTop = myPos.y - gridHeight + 1 + halvarin;
        }

        if (gridTop < navConfig.mapProperties.top * navConfig.scale) {
            gridTop = navConfig.mapProperties.top * navConfig.scale;
        }
        if (gridTop + gridHeight > navConfig.mapProperties.bottom * navConfig.scale) {
            gridTop = navConfig.mapProperties.bottom * navConfig.scale - gridHeight - 1;
        }

        // get grid with mountains
        const grid = this.getGrid(gridWidth, gridHeight, gridLeft, gridTop);

        const BestFirstFinder2 = <any>BestFirstFinder; // @types definitions are not correct
        const finder = new BestFirstFinder2({
            allowDiagonal: true
        });

        const fromX = Math.floor(myPos.x - gridLeft);
        let fromY = Math.floor(myPos.y - gridTop);
        let toX = otherPos.x - gridLeft;
        let toY = otherPos.y - gridTop;

        // target may not be "visible" in our grid
        if (toX < 0) {
            toX = 0;
        }
        if (toX >= gridWidth) {
            toX = gridWidth - 1;
        }

        let searchDirection = 1;
        if (toY < 0) {
            toY = 0;
        }
        if (toY >= gridHeight) {
            toY = gridHeight - 1;
            searchDirection = -1;
        }

        toX = Math.floor(toX);
        toY = Math.floor(toY);

        // prevent to round to an unwalkable place: go up or down until a walkable place was found
        while (!grid.isWalkableAt(toX, toY) && toY > 0 && toY < gridHeight - 1) {
            toY += searchDirection;
        }
        while (!grid.isWalkableAt(fromX, fromY) && fromY > 0 && fromY < gridHeight - 1) {
            fromY += searchDirection;
        }

        let path = finder.findPath(fromX, fromY, toX, toY, grid);

        if (path.length > 0) {
            path = Util.smoothenPath(grid, path);

            const result = [];
            for (let i = 0; i < path.length; i++) {
                const x = (path[i][0] + gridLeft) / navConfig.scale;
                const y = (path[i][1] + gridTop) / navConfig.scale;
                result.push({ x, y });
            }
            return result;
        } else {
            // this is an unwalkable path. Try broadening the grid to find a way around an obstacle (mountain)
            if (margin >= navConfig.maxGridLength) {
                this.log("ultimately unwalkable for " + requestID);
                return []; // sorry, can't find a path
            }
            return this.findPath(myPos, otherPos, requestID, margin + (navConfig.marginStep * navConfig.scale));
        }
    }
}

export { BotNavigation };