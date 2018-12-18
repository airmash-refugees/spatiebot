import { Grid, BestFirstFinder, Util } from "pathfinding";

const navConfig = {
    // map is -16352 to 16352 in the x direction and -8160 to 8160 in the y-direction
    mapProperties: { left: -16352, top: -8160, right: 16352, bottom: 8160 },
    mountainWidth: 175,
    maxGridLength: 2500,
    marginStep: 500,
};

class BotNavigation {
    private mountains;

    setMountains(mountains: { x: number, y: number, scale: number}[]): void {
        this.mountains = mountains;
    }

    private getGrid(width: number, height: number, left: number, top: number): Grid {

        const grid = new Grid(Math.ceil(width), Math.ceil(height));

        this.mountains.forEach(mountain => {
            const thisMountainWidth = navConfig.mountainWidth * mountain.scale;

            if (mountain.x < left - thisMountainWidth || mountain.x > left + width + thisMountainWidth) {
                return;
            }
            if (mountain.y < top - thisMountainWidth || mountain.y > top + height + thisMountainWidth) {
                return;
            }

            // remove walkability of this mountain
            const mountainLeft = mountain.x - thisMountainWidth;
            const mountainRight = mountain.x + thisMountainWidth;
            const mountainTop = mountain.y - thisMountainWidth;
            const mountainBottom = mountain.y + thisMountainWidth;
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

    public findPath(myPos: { x: number, y: number }, otherPos: { x: number, y: number }, margin: number = 0) {

        const halvarin = margin / 2;

        let gridLeft: number;
        const gridWidth = Math.min(navConfig.maxGridLength, Math.abs(otherPos.x - myPos.x) + margin);
        if (otherPos.x > myPos.x) {
            gridLeft = myPos.x - halvarin;
        } else {
            gridLeft = myPos.x - gridWidth + halvarin;
        }

        let gridTop: number;
        const gridHeight = Math.min(navConfig.maxGridLength, Math.abs(otherPos.y - myPos.y) + margin);
        if (otherPos.y > myPos.y) {
            gridTop = myPos.y - halvarin;
        } else {
            gridTop = myPos.y - gridHeight + halvarin;
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
                const x = path[i][0] + gridLeft;
                const y = path[i][1] + gridTop;
                result.push({ x, y });
            }

            return result;
        } else {
            // this is an unwalkable path. Try broadening the grid to find a way around an obstacle (mountain)
            if (margin >= navConfig.maxGridLength) {
                return []; // sorry, can't find a path
            }
            return this.findPath(myPos, otherPos, margin + navConfig.marginStep);
        }
    }
}

export { BotNavigation };