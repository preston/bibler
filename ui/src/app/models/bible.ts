import { Uuidable } from "./sluggable";

export class Bible implements Uuidable{

	id!: string;
	uuid!: string;
	name!: string;
	abbreviation!: string;
	language?: string;
	license?: string;
	ai_default_english?: boolean;
	ai_default_hebrew_ot?: boolean;
	ai_default_greek?: boolean;
	ai_default_aramaic?: boolean;
	created_at!: string;
	updated_at!: string;

}
