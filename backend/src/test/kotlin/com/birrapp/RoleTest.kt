package com.birrapp

import com.birrapp.auth.Role
import com.birrapp.core.ApiException
import kotlin.test.Test
import kotlin.test.assertFailsWith
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
        val users = com.birrapp.auth.UserRepo(TestDb.db)
        val identity = com.birrapp.auth.GoogleIdentity(
            sub = "sub-123", email = "mod@test.local", emailVerified = true,
            name = "Mod", picture = null,
        )
        val created = users.upsert(identity, emptySet())
        val jefe = TestDb.insertUser("jefe", role = "admin")
        users.setRole(jefe, created.id, Role.moderator)

        // Segundo login: refresca nombre/foto pero NO puede tocar el rol.
        val again = users.upsert(identity.copy(name = "Mod Renombrado"), emptySet())
        assertTrue(again.role == Role.moderator, "un re-login no puede degradar a un moderador")
        assertTrue(again.displayName == "Mod Renombrado")
    }

    /**
     * El candado que evita quedarse sin admins.
     *
     * El rol sólo se siembra al crear la cuenta, así que al último admin no lo
     * puede volver a subir nadie: si se baja solo, la única salida es un UPDATE
     * a mano en la base de producción. Un toque de más en una lista de usuarios
     * no puede costar eso.
     */
    @Test fun `nadie se cambia el rol a si mismo`() {
        TestDb.reset()
        val users = com.birrapp.auth.UserRepo(TestDb.db)
        val jefe = TestDb.insertUser("jefe", role = "admin")

        assertFailsWith<ApiException> { users.setRole(jefe, jefe, Role.user) }

        // Y sigue siendo admin: rebotar no puede dejarlo a medio camino.
        assertTrue(users.findById(jefe)!!.role == Role.admin)

        // A otro sí, que es para lo que existe.
        val pitu = TestDb.insertUser("pitu")
        assertTrue(users.setRole(jefe, pitu, Role.admin))
        assertTrue(users.findById(pitu)!!.role == Role.admin)
    }

    @Test fun `bootstrap admin solo aplica al crear`() {
        TestDb.reset()
        val users = com.birrapp.auth.UserRepo(TestDb.db)
        val identity = com.birrapp.auth.GoogleIdentity(
            sub = "sub-boot", email = "jefe@test.local", emailVerified = true,
            name = "Jefe", picture = null,
        )
        val created = users.upsert(identity, setOf("jefe@test.local"))
        assertTrue(created.role == Role.admin)

        // Si después se lo degrada, volver a loguear no lo re-promueve.
        val otro = TestDb.insertUser("otro-admin", role = "admin")
        users.setRole(otro, created.id, Role.user)
        val again = users.upsert(identity, setOf("jefe@test.local"))
        assertTrue(again.role == Role.user, "el bootstrap no puede re-promover a alguien degradado")
    }
}
