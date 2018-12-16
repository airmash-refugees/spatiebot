declare const config: any;

import { Grid, BestFirstFinder, Util } from "pathfinding";

class BotNavigation {
    // map is -16352 to 16352 in the x direction and -8160 to 8160 in the y-direction
    private readonly mapProperties = { left: -16352, top: -8160, right: 16352, bottom: 8160 };
    private readonly mountainWidth = 200;
    private readonly gridMargin = 1500;

    private getGrid(left: number, top: number, size: number): Grid {
        const grid = new Grid(size, size);

        // config.doodads contains info about all mountains
        const mountains = config.doodads;
        mountains.forEach(mountain => {
            const x = mountain[0];
            const y = mountain[1];

            const scale = mountain[3];
            const thisMountainWidth = this.mountainWidth * scale;

            if (x < left - thisMountainWidth || x > left + size + thisMountainWidth) {
                return;
            }
            if (y < top - thisMountainWidth || y > top + size + thisMountainWidth) {
                return;
            }

            // remove walkability of this mountain
            const mountainLeft = x - thisMountainWidth;
            const mountainRight = x + thisMountainWidth;
            const mountainTop = y - thisMountainWidth;
            const mountainBottom = y + thisMountainWidth;
            for (let i = mountainLeft; i <= mountainRight; i++) {
                for (let j = mountainTop; j <= mountainBottom; j++) {
                    const gridX = Math.floor(i - left);
                    const gridY = Math.floor(j - top);
                    if (gridX < 0 || gridX >= size || gridY < 0 || gridY >= size) {
                        continue;
                    }
                    grid.setWalkableAt(gridX, gridY, false);
                }
            }
        });

        return grid;
    }

    public findPath(myPos: { x: number, y: number }, otherPos: { x: number, y: number }) {
        // create a grid of 3000 x 3000 around player
        const gridLeft = myPos.x - this.gridMargin;
        const gridTop = myPos.y - this.gridMargin;
        const gridSize = 2 * this.gridMargin;
        const grid = this.getGrid(gridLeft, gridTop, gridSize);

        const BestFirstFinder2 = <any>BestFirstFinder; // @types definitions are not correct
        const finder = new BestFirstFinder2({
            allowDiagonal: true
        });

        const fromX = Math.floor(myPos.x - gridLeft);
        const fromY = Math.floor(myPos.y - gridTop);
        let toX = otherPos.x - gridLeft;
        let toY = otherPos.y - gridTop;

        // target may not be "visible" in our grid
        if (toX < 0) {
            toX = 0;
        }
        if (toX >= gridSize) {
            toX = gridSize - 1;
        }

        let searchDirection = 1;
        if (toY < 0) {
            toY = 0;
        }
        if (toY >= gridSize) {
            toY = gridSize - 1;
            searchDirection = -1;
        }

        toX = Math.floor(toX);
        toY = Math.floor(toY);

        // prevent to round to an unwalkable place: go up or down until a walkable place was found
        while (!grid.isWalkableAt(Math.floor(toX), Math.floor(toY)) && toY > 0 && toY < gridSize - 1) {
            toY += searchDirection;
        }

        let path = finder.findPath(fromX, fromY, toX, toY, grid);
        path = Util.smoothenPath(grid, path);

        const result = [];
        for (let i = 0; i < path.length; i++) {
            const x = path[i][0] + gridLeft;
            const y = path[i][1] + gridTop;
            result.push({ x, y });
        }

        return result;
    }

}

export { BotNavigation };