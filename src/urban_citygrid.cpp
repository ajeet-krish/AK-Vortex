#include "lbm.hpp"
#include <iostream>
#include <iomanip>
#include <cmath>
#include <string>
#include <filesystem>
#include <vector>
#include <utility>

// ==========================================================================
// AK-Vortex: Urban City Grid (7 buildings)
// ==========================================================================
// 7 buildings: 4 horizontal + 3 vertical, mixed orientations
// Domain: 1200x600, street width = 2x building width
// 3 inlet configurations: East, South, West wind
// ==========================================================================

struct CityGridParams {
    double tau;
    double u_ref;
    int num_steps;
    int save_interval;
    double length_scale;
    int inlet_dir;  // 0=East, 1=South, 2=West
    // Building definitions: {x0, y0, width, height, orientation}
    // orientation: 0=horizontal (long in x), 1=vertical (long in y)
    struct Building {
        int x0, y0, w, h;
        bool vertical;  // true = long in y, false = long in x
    };
    std::vector<Building> buildings;
};

CityGridParams compute_citygrid_params(double Re, int inlet_dir) {
    double u_ref = 0.1;

    // Building dimensions (scaled for larger domain)
    int bldg_w = 120;   // building width
    int bldg_h = 240;   // building height (long dimension)
    int street_w = 2 * bldg_w;  // street width = 2x building width

    // Layout: 4 horizontal buildings (long in x) stacked in y
    //         3 vertical buildings (long in y) spaced in x
    // Street grid with intersections

    CityGridParams params;
    params.u_ref = u_ref;
    params.inlet_dir = inlet_dir;

    // 4 horizontal buildings (long in x, stacked in y)
    int y_start = NY / 6;
    int y_spacing = NY / 5;
    for (int i = 0; i < 4; ++i) {
        int x0 = NX / 6 + i * (bldg_h + street_w / 2);
        int y0 = y_start + i * y_spacing;
        params.buildings.push_back({x0, y0, bldg_h, bldg_w, false});
    }

    // 3 vertical buildings (long in y, spaced in x)
    int x_start = NX / 3;
    int x_spacing = NX / 4;
    for (int i = 0; i < 3; ++i) {
        int x0 = x_start + i * x_spacing;
        int y0 = NY / 4 + i * (bldg_w + street_w / 3);
        params.buildings.push_back({x0, y0, bldg_w, bldg_h, true});
    }

    // Physics
    double length_scale = static_cast<double>(bldg_h);
    double nu = u_ref * length_scale / Re;
    params.tau = 0.5 + 3.0 * nu;
    params.length_scale = length_scale;

    int num_steps = std::max(30000, static_cast<int>(20.0 * NX / u_ref));
    params.num_steps = num_steps;
    params.save_interval = num_steps / 50;

    return params;
}

void place_citygrid_obstacles(LBMCapabilities& system, const CityGridParams& params) {
    // Domain walls: skip the inlet and outlet boundaries (open flow)
    // East inlet  (0): x=0 open (inflow), x=NX-1 open (outflow), y walls
    // South inlet (1): y=0 open (inflow), y=NY-1 open (outflow), x walls
    // West inlet  (2): x=NX-1 open (inflow), x=0 open (outflow), y walls
    int inlet = params.inlet_dir;
    for (int y = 0; y < NY; ++y) {
        for (int x = 0; x < NX; ++x) {
            bool is_wall = false;
            if (y == 0 && inlet != 1) is_wall = true;       // bottom (not south inlet)
            if (y == NY - 1 && inlet != 1) is_wall = true;  // top (not south inlet)
            if (x == 0 && inlet == 1) is_wall = true;       // left wall (south inlet only)
            if (x == NX - 1 && inlet == 1) is_wall = true;  // right wall (south inlet only)
            if (is_wall) system.obstacle[node_index(x, y)] = true;
        }
    }

    // Buildings
    for (const auto& b : params.buildings) {
        for (int y = b.y0; y < b.y0 + b.h && y < NY; ++y) {
            for (int x = b.x0; x < b.x0 + b.w && x < NX; ++x) {
                if (x >= 0 && x < NX && y >= 0 && y < NY) {
                    system.obstacle[node_index(x, y)] = true;
                }
            }
        }
    }
}

int main(int argc, char* argv[]) {
    std::cout << "==============================================" << std::endl;
    std::cout << " AK-Vortex: Urban City Grid (7 buildings)" << std::endl;
    std::cout << " D2Q9 | MRT | OpenMP | Cache-Optimized" << std::endl;
    std::cout << "==============================================" << std::endl;

    NX = 1600; NY = 1200;  // doc default

    double Re = 100.0;
    int steps = -1;
    int inlet_dir = 0;  // 0=East, 1=South, 2=West
    bool save_vtk = false;
    int positional_idx = 1;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--vtk") {
            save_vtk = true;
        } else if (arg == "--use-les") {
            g_use_les = true;
        } else if (arg == "--cs" && i + 1 < argc) {
            g_cs = std::stod(argv[++i]);
        } else if (arg == "--nx" && i + 1 < argc) {
            NX = std::stoi(argv[++i]);
        } else if (arg == "--ny" && i + 1 < argc) {
            NY = std::stoi(argv[++i]);
        } else if (arg == "--inlet" && i + 1 < argc) {
            std::string dir = argv[++i];
            if (dir == "east" || dir == "0") inlet_dir = 0;
            else if (dir == "south" || dir == "1") inlet_dir = 1;
            else if (dir == "west" || dir == "2") inlet_dir = 2;
        } else if (arg.find("--") != 0) {
            if (positional_idx == 1) Re = std::stod(arg);
            else if (positional_idx == 2) steps = std::stoi(arg);
            ++positional_idx;
        }
    }

    g_case = CaseType::URBAN_CITYGRID;
    g_inlet_dir = inlet_dir;
    auto params = compute_citygrid_params(Re, inlet_dir);
    if (steps > 0) {
        params.num_steps = steps;
        params.save_interval = steps / 50;
    }
    LBMCapabilities system;

    place_citygrid_obstacles(system, params);

    // Initialize with equilibrium at rest
    for (int n = 0; n < NX * NY; ++n) {
        double* f_node = &system.f[n * 9];
        for (int i = 0; i < 9; ++i) {
            f_node[i] = compute_equilibrium(i, 1.0, 0.0, 0.0);
        }
    }

    // Output directory
    std::string inlet_name = (inlet_dir == 0) ? "east" :
                             (inlet_dir == 1) ? "south" : "west";
    std::string subdir = "output/urban/city_grid/inlet_" + inlet_name;
    std::filesystem::create_directories(subdir + "/frames");

    // Write metadata
    save_meta_json(subdir, Re, params.tau, params.u_ref,
                   params.length_scale, "urban-citygrid", NX, NY);

    std::cout << "Re = " << Re
              << "  tau = " << params.tau
              << "  steps = " << params.num_steps
              << "  u_ref = " << params.u_ref
              << "  inlet = " << inlet_name
              << "  buildings = " << params.buildings.size()
              << "  collision = " << (g_collision == CollisionType::MRT ? "MRT" : "BGK")
              << (g_use_les ? "  LES(Cs=" + std::to_string(g_cs) + ")" : "")
              << std::endl;

    for (int step = 0; step <= params.num_steps; ++step) {
        execute_time_step(system, params.tau, params.u_ref);

        // Save force history
        double fx_total = 0.0, fy_total = 0.0;
        for (int n = 0; n < NX * NY; ++n) {
            fx_total += system.fx_body[n];
            fy_total += system.fy_body[n];
        }

        save_forces_jsonl(subdir, step, fx_total, fy_total);

        // Save frames at intervals
        if (step % params.save_interval == 0) {
            save_json_frame(system, step, subdir);
            if (save_vtk) {
                save_vtk_frame(system, step, subdir);
            }
        }

        if (step % 1000 == 0) {
            std::cout << "  step " << std::setw(6) << step << std::endl;
        }
    }

    std::cout << "==============================================" << std::endl;
    std::cout << " Urban city grid simulation complete." << std::endl;
    std::cout << "  Re = " << Re << std::endl;
    std::cout << "  Inlet = " << inlet_name << std::endl;
    std::cout << "  Buildings = " << params.buildings.size() << std::endl;
    std::cout << "==============================================" << std::endl;

    return 0;
}
