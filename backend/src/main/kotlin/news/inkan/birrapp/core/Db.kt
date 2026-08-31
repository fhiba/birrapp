package news.inkan.birrapp.core

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.flywaydb.core.Flyway
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.ResultSet
import javax.sql.DataSource

/**
 * JDBC pelado sobre Hikari, sin ORM.
 *
 * Por qué no Exposed: Flyway ya es dueño del esquema, así que el DDL del ORM
 * no se usa; y las consultas que importan (radio PostGIS, DISTINCT ON) van en
 * SQL crudo igual. Un ORM acá agrega una dependencia con API en movimiento a
 * cambio de casi nada. Si las queries se vuelven inmanejables, se reevalúa.
 */
class Db(val dataSource: DataSource) {

    fun migrate() {
        Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .load()
            .migrate()
    }

    fun <T> conn(block: (Connection) -> T): T =
        dataSource.connection.use(block)

    /** Corre [block] en una transacción; hace rollback ante cualquier excepción. */
    fun <T> tx(block: (Connection) -> T): T = dataSource.connection.use { c ->
        c.autoCommit = false
        try {
            val r = block(c)
            c.commit()
            r
        } catch (e: Throwable) {
            c.rollback()
            throw e
        } finally {
            c.autoCommit = true
        }
    }

    companion object {
        fun connect(url: String, user: String, password: String): Db {
            val cfg = HikariConfig().apply {
                jdbcUrl = url
                username = user
                this.password = password
                maximumPoolSize = 10
                driverClassName = "org.postgresql.Driver"
            }
            return Db(HikariDataSource(cfg))
        }
    }
}

// ---- helpers ----

fun <T> Connection.query(sql: String, vararg args: Any?, map: (ResultSet) -> T): List<T> =
    prepareStatement(sql).use { st ->
        st.bindAll(args)
        st.executeQuery().use { rs ->
            buildList { while (rs.next()) add(map(rs)) }
        }
    }

fun <T> Connection.queryOne(sql: String, vararg args: Any?, map: (ResultSet) -> T): T? =
    query(sql, *args, map = map).firstOrNull()

fun Connection.update(sql: String, vararg args: Any?): Int =
    prepareStatement(sql).use { st ->
        st.bindAll(args)
        st.executeUpdate()
    }

private fun PreparedStatement.bindAll(args: Array<out Any?>) {
    args.forEachIndexed { i, a -> setObject(i + 1, a) }
}

fun ResultSet.longOrNull(col: String): Long? = getLong(col).takeUnless { wasNull() }
fun ResultSet.intOrNull(col: String): Int? = getInt(col).takeUnless { wasNull() }
