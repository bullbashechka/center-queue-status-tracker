import type { ChildStatus } from "@queue-tracker/shared";
import { childStatusValues } from "@queue-tracker/shared";

import { bootstrapDatabase } from "../db/bootstrap.js";
import { createDb, createSqlite } from "../db/client.js";
import { getConfig } from "../config.js";
import {
  changeChildStatus,
  createChild,
  getAdminChildById,
  ChildConflictError
} from "../domain/children.js";

const SEED_EMPLOYEE_ID = 1;

type SeedChild = {
  fullName: string;
  iin: string;
  parentPhone: string;
  estimatedStartText?: string;
  targetStatus: ChildStatus;
};

// Тестовый набор: дети распределены по всем этапам очереди.
const seedChildren: SeedChild[] = [
  { fullName: "Алиев Тимур Асланович", iin: "180312600123", parentPhone: "+7 701 234 5601", estimatedStartText: "Сентябрь 2026", targetStatus: "documents_accepted" },
  { fullName: "Бекова Аружан Нурлановна", iin: "190425600234", parentPhone: "+7 702 345 6702", estimatedStartText: "Сентябрь 2026", targetStatus: "documents_accepted" },
  { fullName: "Сидоров Артём Игоревич", iin: "170108600345", parentPhone: "8 705 456 7803", targetStatus: "documents_accepted" },
  { fullName: "Жумабекова Дильназ Ерлановна", iin: "200730600456", parentPhone: "+7 707 567 8904", estimatedStartText: "Октябрь 2026", targetStatus: "documents_accepted" },
  { fullName: "Ким Даниэль Сергеевич", iin: "180519600567", parentPhone: "+7 708 678 9005", targetStatus: "documents_accepted" },
  { fullName: "Оспанов Алихан Маратович", iin: "190603600678", parentPhone: "+7 700 789 0106", estimatedStartText: "Сентябрь 2026", targetStatus: "diagnostics_passed" },
  { fullName: "Иванова Полина Андреевна", iin: "170914600789", parentPhone: "+7 701 890 1207", targetStatus: "diagnostics_passed" },
  { fullName: "Нурланова Камила Бахытовна", iin: "200221600890", parentPhone: "8 702 901 2308", estimatedStartText: "Ноябрь 2026", targetStatus: "diagnostics_passed" },
  { fullName: "Петров Михаил Денисович", iin: "180706600901", parentPhone: "+7 705 012 3409", targetStatus: "diagnostics_passed" },
  { fullName: "Сулейменова Аиша Тимуровна", iin: "190817601012", parentPhone: "+7 707 123 4510", estimatedStartText: "Сентябрь 2026", targetStatus: "waiting_for_enrollment" },
  { fullName: "Абдрахманов Ермек Саматович", iin: "170429601123", parentPhone: "+7 708 234 5611", targetStatus: "waiting_for_enrollment" },
  { fullName: "Орлова София Максимовна", iin: "200110601234", parentPhone: "8 700 345 6712", estimatedStartText: "Октябрь 2026", targetStatus: "waiting_for_enrollment" },
  { fullName: "Тулегенов Арман Бекетович", iin: "180925601345", parentPhone: "+7 701 456 7813", targetStatus: "enrolled" },
  { fullName: "Морозова Варвара Павловна", iin: "190204601456", parentPhone: "+7 702 567 8914", targetStatus: "enrolled" },
  { fullName: "Қайратұлы Дамир", iin: "170611601567", parentPhone: "+7 705 678 9015", estimatedStartText: "Зачислен", targetStatus: "enrolled" }
];

async function advanceTo(db: ReturnType<typeof createDb>, childId: number, targetStatus: ChildStatus): Promise<void> {
  const targetIndex = childStatusValues.indexOf(targetStatus);

  for (let stepIndex = 1; stepIndex <= targetIndex; stepIndex += 1) {
    const detail = await getAdminChildById(db, childId);

    if (!detail) {
      throw new Error(`Не найден ребёнок ${childId} при продвижении статуса.`);
    }

    await changeChildStatus(
      db,
      childId,
      { status: childStatusValues[stepIndex], expectedUpdatedAt: detail.updatedAt },
      SEED_EMPLOYEE_ID
    );
  }
}

async function main() {
  const config = getConfig();
  const sqlite = createSqlite(config.DATABASE_URL);
  bootstrapDatabase(sqlite);
  const db = createDb(sqlite);

  let created = 0;
  let skipped = 0;

  for (const seed of seedChildren) {
    try {
      const child = await createChild(
        db,
        {
          fullName: seed.fullName,
          iin: seed.iin,
          parentPhone: seed.parentPhone,
          estimatedStartText: seed.estimatedStartText ?? ""
        },
        SEED_EMPLOYEE_ID
      );

      await advanceTo(db, child.id, seed.targetStatus);
      created += 1;
      console.log(`+ ${seed.fullName} — ${seed.targetStatus}`);
    } catch (error) {
      if (error instanceof ChildConflictError) {
        skipped += 1;
        console.log(`= ${seed.fullName} — уже есть активная запись с таким ИИН, пропускаю`);
        continue;
      }

      throw error;
    }
  }

  console.log(`\nГотово. Добавлено: ${created}, пропущено: ${skipped}.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
