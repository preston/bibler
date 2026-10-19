import { Uuidable } from "./sluggable.js";
import { Bible } from "./bible.js";

export class Book implements Uuidable{
    id!: string;
    uuid!: string;
    name!: string;
    ordinal!: number;
    bible?: Bible;
    testament?: 'old' | 'new' | 'other';
    createdAt!: string;
    updatedAt!: string;
}