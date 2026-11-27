import { DeleteAccountSchema } from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class DeleteAccountDto extends createZodDto(DeleteAccountSchema) {}
