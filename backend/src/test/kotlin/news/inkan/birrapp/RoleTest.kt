package news.inkan.birrapp

import news.inkan.birrapp.auth.Role
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** La jerarquía de roles. El control real vive en `requireRole`, del lado del servidor. */
class RoleTest {

    @Test fun `admin implica moderator e implica user`() {
        assertTrue(Role.admin.atLeast(Role.moderator))
        assertTrue(Role.admin.atLeast(Role.user))
        assertTrue(Role.moderator.atLeast(Role.user))
    }

    @Test fun `un user no alcanza para moderar`() {
        assertFalse(Role.user.atLeast(Role.moderator))
        assertFalse(Role.user.atLeast(Role.admin))
        assertFalse(Role.moderator.atLeast(Role.admin))
    }

    @Test fun `volver a loguear no cambia el rol`() {
        TestDb.reset()
        val users = news.inkan.birrapp.auth.UserRepo(TestDb.db)
        val identity = news.inkan.birrapp.auth.GoogleIdentity(
            sub = "sub-123", email = "mod@test.local", emailVerified = true,
            name = "Mod", picture = null,
        )
        val created = users.upsert(identity, emptySet())
        users.setRole(created.id, Role.moderator)

        // Segundo login: refresca nombre/foto pero NO puede tocar el rol.
        val again = users.upsert(identity.copy(name = "Mod Renombrado"), emptySet())
        assertTrue(again.role == Role.moderator, "un re-login no puede degradar a un moderador")
        assertTrue(again.displayName == "Mod Renombrado")
    }

    @Test fun `bootstrap admin solo aplica al crear`() {
        TestDb.reset()
        val users = news.inkan.birrapp.auth.UserRepo(TestDb.db)
        val identity = news.inkan.birrapp.auth.GoogleIdentity(
            sub = "sub-boot", email = "jefe@test.local", emailVerified = true,
            name = "Jefe", picture = null,
        )
        val created = users.upsert(identity, setOf("jefe@test.local"))
        assertTrue(created.role == Role.admin)

        // Si después se lo degrada, volver a loguear no lo re-promueve.
        users.setRole(created.id, Role.user)
        val again = users.upsert(identity, setOf("jefe@test.local"))
        assertTrue(again.role == Role.user, "el bootstrap no puede re-promover a alguien degradado")
    }
}
