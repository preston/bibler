import { Uuidable } from "./sluggable";
import { Bible } from "./bible";

export class Book implements Uuidable{
    id!: string;
    uuid!: string;
    name!: string;
    ordinal!: number;
    bible?: Bible;
    testament?: 'old' | 'new' | 'other';
    created_at!: string;
    updated_at!: string;
}