package com.birrapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.birrapp.di.AppContainer
import com.birrapp.ui.auth.AuthViewModel
import com.birrapp.ui.bar.AddBarScreen
import com.birrapp.ui.bar.BarDetailScreen
import com.birrapp.ui.bar.BarDetailViewModel
import com.birrapp.ui.list.ListScreen
import com.birrapp.ui.map.MapScreen
import com.birrapp.ui.map.MapViewModel
import com.birrapp.ui.moderation.ModerationScreen
import com.birrapp.ui.moderation.ModerationViewModel
import com.birrapp.ui.profile.ProfileScreen
import com.birrapp.ui.theme.BirrappTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as BirrappApplication).container

        setContent {
            BirrappTheme { BirrappApp(container) }
        }
    }
}

/** Factory mínima: evita traer Hilt para instanciar cinco ViewModels. */
@Suppress("UNCHECKED_CAST")
private fun factory(create: () -> ViewModel) = object : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
}

private object Routes {
    const val MAP = "map"
    const val LIST = "list"
    const val PROFILE = "profile"
    const val MODERATION = "moderation"
    const val BAR = "bar/{barId}"
    const val ADD_BAR = "addBar/{lat}/{lng}"
    fun bar(id: Long) = "bar/$id"
    fun addBar(lat: Double, lng: Double) = "addBar/$lat/$lng"
}

@Composable
fun BirrappApp(container: AppContainer) {
    val navController = rememberNavController()

    val authViewModel: AuthViewModel = viewModel(
        factory = factory { AuthViewModel(container.api, container.session, container.googleSignIn) }
    )
    val authState by authViewModel.state.collectAsState()

    // Un solo MapViewModel compartido entre mapa y lista: cambiar el orden en
    // una pantalla tiene que verse reflejado en la otra.
    val mapViewModel: MapViewModel = viewModel(
        factory = factory { MapViewModel(container.bars, container.location) }
    )
    val mapState by mapViewModel.state.collectAsState()

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = currentRoute in setOf(Routes.MAP, Routes.LIST, Routes.PROFILE)

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    NavigationBarItem(
                        selected = currentRoute == Routes.MAP,
                        onClick = { navController.navigate(Routes.MAP) { launchSingleTop = true } },
                        icon = { Icon(Icons.Default.Place, null) },
                        label = { Text(stringResource(R.string.tab_map)) },
                    )
                    NavigationBarItem(
                        selected = currentRoute == Routes.LIST,
                        onClick = { navController.navigate(Routes.LIST) { launchSingleTop = true } },
                        icon = { Icon(Icons.AutoMirrored.Filled.List, null) },
                        label = { Text(stringResource(R.string.tab_list)) },
                    )
                    NavigationBarItem(
                        selected = currentRoute == Routes.PROFILE,
                        onClick = {
                            navController.navigate(Routes.PROFILE) { launchSingleTop = true }
                        },
                        icon = { Icon(Icons.Default.Person, null) },
                        label = { Text(stringResource(R.string.tab_profile)) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Routes.MAP,
            modifier = Modifier.padding(padding),
        ) {
            composable(Routes.MAP) {
                MapScreen(
                    viewModel = mapViewModel,
                    onBarClick = { navController.navigate(Routes.bar(it)) },
                    onAddBar = { lat, lng ->
                        if (authState.user != null) {
                            navController.navigate(Routes.addBar(lat, lng))
                        } else {
                            navController.navigate(Routes.PROFILE)
                        }
                    },
                )
            }

            composable(Routes.LIST) {
                ListScreen(mapViewModel) { navController.navigate(Routes.bar(it)) }
            }

            composable(Routes.PROFILE) {
                ProfileScreen(
                    user = authState.user,
                    signingIn = authState.signingIn,
                    authError = authState.error,
                    onSignIn = authViewModel::signIn,
                    onSignOut = authViewModel::signOut,
                    onOpenModeration = { navController.navigate(Routes.MODERATION) },
                )
            }

            composable(Routes.MODERATION) {
                val vm: ModerationViewModel = viewModel(
                    factory = factory { ModerationViewModel(container.api) }
                )
                ModerationScreen(vm) { navController.popBackStack() }
            }

            composable(
                Routes.BAR,
                arguments = listOf(navArgument("barId") { type = NavType.LongType }),
            ) { entry ->
                val barId = entry.arguments?.getLong("barId") ?: return@composable
                val vm: BarDetailViewModel = viewModel(
                    key = "bar-$barId",
                    factory = factory {
                        BarDetailViewModel(
                            container.api, barId,
                            mapState.center.first, mapState.center.second,
                        )
                    },
                )
                BarDetailScreen(
                    viewModel = vm,
                    isSignedIn = authState.user != null,
                    onBack = { navController.popBackStack() },
                    onNeedSignIn = { navController.navigate(Routes.PROFILE) },
                )
            }

            composable(
                Routes.ADD_BAR,
                arguments = listOf(
                    navArgument("lat") { type = NavType.FloatType },
                    navArgument("lng") { type = NavType.FloatType },
                ),
            ) { entry ->
                val lat = entry.arguments?.getFloat("lat")?.toDouble() ?: return@composable
                val lng = entry.arguments?.getFloat("lng")?.toDouble() ?: return@composable
                AddBarScreen(
                    api = container.api,
                    lat = lat, lng = lng,
                    onBack = { navController.popBackStack() },
                    onDone = {
                        mapViewModel.load(force = true)
                        navController.popBackStack()
                    },
                )
            }
        }
    }
}
