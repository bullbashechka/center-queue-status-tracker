import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

// Определяем IP клиента. За обратным прокси настоящий адрес приходит в
// X-Forwarded-For (берём левый — исходный клиент). Доверие к этому заголовку —
// сознательное MVP-допущение (приложение работает за доверенным прокси).
// При прямом подключении используем адрес сокета через getConnInfo.
export function getClientIp(c: Context): string {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  try {
    const address = getConnInfo(c).remote.address;
    if (address) {
      return address;
    }
  } catch {
    // В тестовом окружении (app.request) сокета нет — игнорируем.
  }

  return "unknown";
}
