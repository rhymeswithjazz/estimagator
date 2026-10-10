-- @code='BENCH500'
-- @p='1'
SELECT s1."Id", s1."AccessCode", s1."CreatedAt", s1."DeckType", s1."GuestHostClaimedAt", s1."GuestHostTokenHash", s1."IsActive", s1."Name", s1."OrganizerId", s1."TimerDurationSeconds", p."Id", p."ConnectionId", p."DisplayName", p."IsObserver", p."IsOrganizer", p."JoinedAt", p."SessionId", p."UserId", s2."Id", s2."CreatedAt", s2."FinalScore", s2."SessionId", s2."SortOrder", s2."Status", s2."Title", s2."Url", s2."Id0", s2."CardValue", s2."CreatedAt0", s2."ParticipantId", s2."StoryId"
FROM (
    SELECT s."Id", s."AccessCode", s."CreatedAt", s."DeckType", s."GuestHostClaimedAt", s."GuestHostTokenHash", s."IsActive", s."Name", s."OrganizerId", s."TimerDurationSeconds"
    FROM "Sessions" AS s
    WHERE s."AccessCode" = @code AND s."IsActive"
    LIMIT @p
) AS s1
LEFT JOIN "Participants" AS p ON s1."Id" = p."SessionId"
LEFT JOIN (
    SELECT s0."Id", s0."CreatedAt", s0."FinalScore", s0."SessionId", s0."SortOrder", s0."Status", s0."Title", s0."Url", v."Id" AS "Id0", v."CardValue", v."CreatedAt" AS "CreatedAt0", v."ParticipantId", v."StoryId"
    FROM "Stories" AS s0
    LEFT JOIN "Votes" AS v ON s0."Id" = v."StoryId"
) AS s2 ON s1."Id" = s2."SessionId"
ORDER BY s1."Id", p."Id", s2."Id"