import { getDb } from "@/db";
import { catalogTypes } from "@/db/schema";
import { handle, body } from "@/server/http";
import * as service from "@/server/service";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return handle(request, async (actor) => {
    const db = getDb(),
      method = request.method;
    const key = request.headers.get("Idempotency-Key") ?? "";
    if (path.join("/") === "families") {
      if (method === "GET") return service.listFamilies(db, actor);
      if (method === "POST")
        return service.createFamily(db, actor, await body(request));
    }
    if (path.join("/") === "catalog" && method === "GET")
      return db.select().from(catalogTypes);
    if (path.join("/") === "invitations/accept" && method === "POST")
      return service.acceptInvitation(db, actor, await body(request));
    if (path[0] === "families" && path[1]) {
      const familyId = path[1],
        section = path[2],
        id = path[3],
        action = path[4];
      if (section === "snapshot" && path.length === 3 && method === "GET")
        return service.snapshot(db, familyId, actor);
      if (section === "preferences" && path.length === 3 && method === "PUT")
        return service.savePreferences(
          db,
          familyId,
          actor,
          await body(request),
        );
      if (section === "export" && path.length === 3 && method === "POST")
        return service.exportRecords(db, familyId, actor);
      if (section === "members") {
        if (path.length === 3 && method === "GET")
          return service.listMembers(db, familyId, actor);
        if (path.length === 4 && method === "DELETE")
          return service.revokeMember(db, familyId, actor, id);
      }
      if (section === "invitations" && path.length === 3 && method === "POST")
        return service.inviteMember(db, familyId, actor, await body(request));
      if (section === "records") {
        if (path.length === 3 && method === "POST")
          return service.createRecord(
            db,
            familyId,
            actor,
            await body(request),
            key,
          );
        if (path.length === 5 && action === "history" && method === "GET")
          return service.recordHistory(db, familyId, actor, id);
        if (path.length === 4 && method === "PATCH")
          return service.editRecord(
            db,
            familyId,
            actor,
            id,
            await body(request),
            key,
          );
        if (path.length === 5 && method === "POST") {
          if (action === "payments")
            return service.addPayment(
              db,
              familyId,
              actor,
              id,
              await body(request),
              key,
            );
          if (action === "archive")
            return service.archiveRecord(
              db,
              familyId,
              actor,
              id,
              await body(request),
              key,
            );
          if (action === "valuations")
            return service.addValuation(
              db,
              familyId,
              actor,
              id,
              await body(request),
              key,
            );
          if (action === "grants")
            return service.setGrant(
              db,
              familyId,
              actor,
              id,
              await body(request),
            );
        }
      }
    }
    throw new AppError("NOT_FOUND", 404);
  });
}
export {
  handler as GET,
  handler as POST,
  handler as PATCH,
  handler as PUT,
  handler as DELETE,
};
