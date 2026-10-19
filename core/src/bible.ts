import { Uuidable } from "./sluggable.js";

export class Bible implements Uuidable{

	id!: string;
	uuid!: string;
	name!: string;
	abbreviation!: string;
	language?: string;
	license?: string;
	aiDefaultEnglish?: boolean;
	aiDefaultHebrewOt?: boolean;
	aiDefaultGreek?: boolean;
	aiDefaultAramaic?: boolean;
	createdAt!: string;
	updatedAt!: string;

}
