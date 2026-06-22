import type { EmployeeSession } from "@queue-tracker/shared";

export type AppEnv = {
  Variables: {
    employee: EmployeeSession;
  };
};
