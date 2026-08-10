#include "solver_c_api.h"
#include "lbm.hpp"
#include "geometry.hpp"
#include <string>
#include <vector>
#include <filesystem>
#include <cmath>
#include <random>
#include <fstream>
#include <sstream>
#include <atomic>

// Global cancel flag checked periodically by the solver loop
static std::atomic<bool> g_cancel_flag{false};

extern "C" void lbm_set_cancel_flag(bool cancel) {
    g_cancel_flag.store(cancel, std::memory_order_relaxed);
}

// Frame callback invoked after each binary frame is saved
static lbm_frame_callback_t g_frame_callback = nullptr;

extern "C" void lbm_register_frame_callback(lbm_frame_callback_t cb) {
    g_frame_callback = cb;
}

extern "C" void lbm_save_binary_frame(void* system, int step, const char* output_dir) {
    auto* sys = static_cast<LBMCapabilities*>(system);
    save_binary_frame(*sys, step, std::string(output_dir));
}

// ==========================================================================
// Reset all C++ global solver state between runs
// ==========================================================================
extern "C" void reset_solver_state() {
    g_use_les = false;
    g_case = CaseType::CYLINDER;
    g_collision = CollisionType::MRT;
    g_step_h_step = -1;
    g_step_h_inlet = -1;
    g_inlet_dir = 0;
}

// ==========================================================================
// Simple JSON shape parser (no external dependencies)
// Parses geometry JSON array of shape primitives:
//   {"type":"circle",    "x":N, "y":N, "radius":N}
//   {"type":"rectangle", "x":N, "y":N, "width":N, "height":N}
//   {"type":"polygon",   "points":[[x,y],[x,y],...]}
// ==========================================================================

struct Shape {
    std::string type;
    double x = 0.0;
    double y = 0.0;
    double radius = 0.0;
    double width = 0.0;
    double height = 0.0;
    std::vector<std::pair<double, double>> points;
};

// Skip whitespace, return position after whitespace
static size_t skip_ws(const std::string& s, size_t pos) {
    while (pos < s.size() && (s[pos] == ' ' || s[pos] == '\t' ||
           s[pos] == '\n' || s[pos] == '\r')) {
        ++pos;
    }
    return pos;
}

// Extract a double value after a colon
static double parse_number(const std::string& s, size_t& pos) {
    pos = skip_ws(s, pos);
    // Handle negative sign
    bool neg = false;
    if (pos < s.size() && s[pos] == '-') {
        neg = true;
        ++pos;
    }
    double val = 0.0;
    while (pos < s.size() && s[pos] >= '0' && s[pos] <= '9') {
        val = val * 10.0 + (s[pos] - '0');
        ++pos;
    }
    if (pos < s.size() && s[pos] == '.') {
        ++pos;
        double frac = 0.1;
        while (pos < s.size() && s[pos] >= '0' && s[pos] <= '9') {
            val += (s[pos] - '0') * frac;
            frac *= 0.1;
            ++pos;
        }
    }
    return neg ? -val : val;
}

// Find the next occurrence of a character, skipping quoted strings
static size_t find_char(const std::string& s, char ch, size_t pos) {
    bool in_str = false;
    while (pos < s.size()) {
        if (in_str) {
            if (s[pos] == '\\') { pos += 2; continue; }
            if (s[pos] == '"') in_str = false;
        } else {
            if (s[pos] == '"') { in_str = true; }
            else if (s[pos] == ch) return pos;
        }
        ++pos;
    }
    return std::string::npos;
}

// Extract a quoted string value
static std::string parse_string(const std::string& s, size_t& pos) {
    pos = skip_ws(s, pos);
    if (pos >= s.size() || s[pos] != '"') return "";
    ++pos; // skip opening quote
    std::string result;
    while (pos < s.size() && s[pos] != '"') {
        if (s[pos] == '\\') {
            ++pos;
            if (pos < s.size()) result += s[pos];
        } else {
            result += s[pos];
        }
        ++pos;
    }
    if (pos < s.size()) ++pos; // skip closing quote
    return result;
}

// Find a key in a JSON object and return position after its value
static size_t find_key(const std::string& s, const std::string& key, size_t start) {
    size_t pos = start;
    while (pos < s.size()) {
        pos = skip_ws(s, pos);
        if (pos >= s.size() || s[pos] == '}') return std::string::npos;
        std::string k = parse_string(s, pos);
        pos = skip_ws(s, pos);
        if (pos < s.size() && s[pos] == ':') ++pos;
        if (k == key) return pos;
        // skip value
        pos = skip_ws(s, pos);
        if (pos >= s.size()) break;
        if (s[pos] == '"') {
            parse_string(s, pos);
        } else if (s[pos] == '[') {
            int depth = 1;
            ++pos;
            while (pos < s.size() && depth > 0) {
                if (s[pos] == '[') ++depth;
                else if (s[pos] == ']') --depth;
                ++pos;
            }
        } else if (s[pos] == '{') {
            int depth = 1;
            ++pos;
            while (pos < s.size() && depth > 0) {
                if (s[pos] == '{') ++depth;
                else if (s[pos] == '}') --depth;
                ++pos;
            }
        } else {
            // number or true/false/null
            while (pos < s.size() && s[pos] != ',' && s[pos] != '}' && s[pos] != ']') ++pos;
        }
        pos = skip_ws(s, pos);
        if (pos < s.size() && s[pos] == ',') ++pos;
    }
    return std::string::npos;
}

// Parse a polygon points array: [[x1,y1],[x2,y2],...]
static std::vector<std::pair<double, double>> parse_points_array(const std::string& s,
                                                                 size_t pos) {
    std::vector<std::pair<double, double>> result;
    pos = skip_ws(s, pos);
    if (pos >= s.size() || s[pos] != '[') return result;
    ++pos; // skip outer [

    while (pos < s.size()) {
        pos = skip_ws(s, pos);
        if (pos >= s.size() || s[pos] == ']') break;
        if (s[pos] == ',') { ++pos; continue; }
        if (s[pos] == '[') {
            ++pos; // inner [
            double x = parse_number(s, pos);
            pos = skip_ws(s, pos);
            if (pos < s.size() && s[pos] == ',') ++pos;
            double y = parse_number(s, pos);
            result.push_back({x, y});
            pos = skip_ws(s, pos);
            if (pos < s.size() && s[pos] == ']') ++pos; // inner ]
        } else {
            ++pos;
        }
    }
    return result;
}

// Parse a JSON array of shapes
static std::vector<Shape> parse_geometry_json(const char* json) {
    std::vector<Shape> shapes;
    if (!json || !json[0]) return shapes;

    std::string s(json);
    size_t pos = 0;
    pos = skip_ws(s, pos);
    if (pos >= s.size() || s[pos] != '[') return shapes;
    ++pos; // skip outer [

    while (pos < s.size()) {
        pos = skip_ws(s, pos);
        if (pos >= s.size() || s[pos] == ']') break;
        if (s[pos] == ',') { ++pos; continue; }
        if (s[pos] != '{') { ++pos; continue; }

        // Parse a shape object
        Shape shape;
        size_t obj_start = pos;
        // Find matching closing brace
        int depth = 1;
        ++pos;
        while (pos < s.size() && depth > 0) {
            if (s[pos] == '{') ++depth;
            else if (s[pos] == '}') --depth;
            ++pos;
        }
        size_t obj_end = pos;
        std::string obj = s.substr(obj_start, obj_end - obj_start);

        // Extract type
        size_t key_pos = find_key(obj, "type", 1);
        if (key_pos != std::string::npos) {
            shape.type = parse_string(obj, key_pos);
        }

        // Extract numeric fields
        key_pos = find_key(obj, "x", 1);
        if (key_pos != std::string::npos) shape.x = parse_number(obj, key_pos);

        key_pos = find_key(obj, "y", 1);
        if (key_pos != std::string::npos) shape.y = parse_number(obj, key_pos);

        key_pos = find_key(obj, "radius", 1);
        if (key_pos != std::string::npos) shape.radius = parse_number(obj, key_pos);

        key_pos = find_key(obj, "width", 1);
        if (key_pos != std::string::npos) shape.width = parse_number(obj, key_pos);

        key_pos = find_key(obj, "height", 1);
        if (key_pos != std::string::npos) shape.height = parse_number(obj, key_pos);

        // Extract points array for polygon
        key_pos = find_key(obj, "points", 1);
        if (key_pos != std::string::npos) {
            shape.points = parse_points_array(obj, key_pos);
        }

        if (!shape.type.empty()) {
            shapes.push_back(shape);
        }
    }
    return shapes;
}

// Mark obstacle nodes in the solver from parsed shape primitives
static void mark_obstacles_from_shapes(LBMCapabilities& sys,
                                       const std::vector<Shape>& shapes) {
    for (const auto& shape : shapes) {
        if (shape.type == "circle") {
            int ix = static_cast<int>(shape.x);
            int iy = static_cast<int>(shape.y);
            int ir = static_cast<int>(shape.radius);
            // Add circle to bounce-back geometry for interpolated BB
            sys.bb_geom.cylinders.push_back({shape.x, shape.y, shape.radius});
            for (int y = std::max(0, iy - ir - 1); y <= std::min(NY - 1, iy + ir + 1); ++y) {
                for (int x = std::max(0, ix - ir - 1); x <= std::min(NX - 1, ix + ir + 1); ++x) {
                    double dx = static_cast<double>(x) - shape.x;
                    double dy = static_cast<double>(y) - shape.y;
                    if (dx * dx + dy * dy <= shape.radius * shape.radius) {
                        sys.obstacle[node_index(x, y)] = true;
                    }
                }
            }
        } else if (shape.type == "rectangle") {
            int x0 = std::max(0, static_cast<int>(shape.x));
            int y0 = std::max(0, static_cast<int>(shape.y));
            int x1 = std::min(NX, static_cast<int>(shape.x + shape.width));
            int y1 = std::min(NY, static_cast<int>(shape.y + shape.height));
            for (int y = y0; y < y1; ++y) {
                for (int x = x0; x < x1; ++x) {
                    sys.obstacle[node_index(x, y)] = true;
                }
            }
        } else if (shape.type == "polygon") {
            if (shape.points.size() >= 3) {
                // Convert to the format expected by point_in_polygon
                std::vector<std::pair<double, double>> poly;
                poly.reserve(shape.points.size());
                for (const auto& pt : shape.points) {
                    poly.push_back(pt);
                }
                for (int y = 0; y < NY; ++y) {
                    for (int x = 0; x < NX; ++x) {
                        if (point_in_polygon(static_cast<double>(x),
                                             static_cast<double>(y), poly)) {
                            sys.obstacle[node_index(x, y)] = true;
                        }
                    }
                }
                // Store polygon vertices for interpolated bounce-back.
                // NOTE: Only the first polygon gets bounce-back geometry.
                // Additional polygons are obstacle-masked but use straight
                // bounce-back (q=1). This limitation exists because
                // BounceBackGeometry stores a single set of poly_vertices.
                if (!sys.bb_geom.is_polygon) {
                    sys.bb_geom.poly_vertices = poly;
                    sys.bb_geom.is_polygon = true;
                }
            }
        }
    }
}

int lbm_solve_c(
    int nx, int ny,
    double re, double u_inflow,
    int max_steps, int save_interval,
    const char* output_dir,
    const char* case_type
) {
    // Reset global state from any previous run
    reset_solver_state();

    // Set global grid dimensions
    NX = nx;
    NY = ny;

    // Set case type
    std::string case_str(case_type);
    if (case_str == "cylinder") {
        g_case = CaseType::CYLINDER;
    } else if (case_str == "cavity") {
        g_case = CaseType::CAVITY;
    } else if (case_str == "step") {
        g_case = CaseType::STEP;
    } else {
        return -1;
    }

    // Compute tau from Re
    double D = 60.0;
    double nu = u_inflow * D / re;
    double tau = 0.5 + 3.0 * nu;

    // Auto-LES for high Re
    if (tau < 0.55) {
        g_use_les = true;
    }

    // Create output directory
    std::string out_dir(output_dir);
    std::filesystem::create_directories(out_dir + "/frames");

    // Initialize system
    LBMCapabilities system;

    // Initialize based on case type
    if (g_case == CaseType::CYLINDER) {
        int cx_cyl = NX / 4;
        int cy_cyl = NY / 2 + 1;
        int radius = std::max(10, NY / 10);
        place_cylinder(system, cx_cyl, cy_cyl, radius);

        // Initialize with equilibrium
        for (int n = 0; n < NX * NY; ++n) {
            double* f_node = &system.f[n * 9];
            for (int i = 0; i < 9; ++i) {
                f_node[i] = compute_equilibrium(i, 1.0, u_inflow, 0.0);
            }
        }

        // Perturbation to trigger shedding
        std::mt19937 rng(42);
        std::uniform_real_distribution<double> pert_dist(-1e-4, 1e-4);
        for (int x = cx_cyl + 5; x < std::min(NX, cx_cyl + 60); ++x) {
            for (int y = 0; y < NY; ++y) {
                int n = node_index(x, y);
                if (system.obstacle[n]) continue;
                double* f_node = &system.f[n * 9];
                double v_pert = pert_dist(rng);
                double rho, u, v;
                compute_macros(f_node, rho, u, v);
                for (int i = 0; i < 9; ++i) {
                    f_node[i] = compute_equilibrium(i, rho, u, v + v_pert);
                }
            }
        }
    } else if (g_case == CaseType::CAVITY) {
        place_walls(system);

        // Initialize to rest
        for (int n = 0; n < NX * NY; ++n) {
            double* f_node = &system.f[n * 9];
            for (int i = 0; i < 9; ++i) {
                f_node[i] = compute_equilibrium(i, 1.0, 0.0, 0.0);
            }
        }
    } else if (g_case == CaseType::STEP) {
        int h_step = NY / 2;
        for (int y = 0; y < h_step; ++y) {
            for (int x = 0; x < NX / 4; ++x) {
                system.obstacle[node_index(x, y)] = true;
            }
        }

        // Initialize to rest
        for (int n = 0; n < NX * NY; ++n) {
            double* f_node = &system.f[n * 9];
            for (int i = 0; i < 9; ++i) {
                f_node[i] = compute_equilibrium(i, 1.0, 0.0, 0.0);
            }
        }
    }

    // Save metadata
    save_meta_json(out_dir, re, tau, u_inflow, D, case_str, NX, NY);

    // Run simulation
    for (int step = 0; step <= max_steps; ++step) {
        // Check cancel every 100 steps
        if (step % 100 == 0 && g_cancel_flag.load(std::memory_order_relaxed)) {
            return step;
        }

        execute_time_step(system, tau, u_inflow);

        // Save forces
        double fx_total = 0.0, fy_total = 0.0;
        for (int n = 0; n < NX * NY; ++n) {
            fx_total += system.fx_body[n];
            fy_total += system.fy_body[n];
        }
        save_forces_jsonl(out_dir, step, fx_total, fy_total);

        // Save frames
        if (step % save_interval == 0) {
            save_json_frame(system, step, out_dir);
            save_binary_frame(system, step, out_dir);
            if (g_frame_callback) {
                g_frame_callback(step);
            }
        }
    }

    return 0;
}

int lbm_solve_geometry(
    int nx, int ny,
    double re, double u_inflow,
    int max_steps, int save_interval,
    const char* output_dir,
    const char* geometry_json
) {
    // Reset global state from any previous run
    reset_solver_state();

    // Set global grid dimensions
    NX = nx;
    NY = ny;

    // Use CYLINDER case type (flow-through domain, no walls)
    g_case = CaseType::CYLINDER;

    // Compute characteristic length from obstacle bounding box
    // Default to 60 if geometry is empty
    std::vector<Shape> shapes = parse_geometry_json(geometry_json);

    // Flip y-coordinates: canvas y=0 is top, solver y=0 is bottom
    for (auto& shape : shapes) {
        if (shape.type == "circle") {
            shape.y = NY - 1 - shape.y;
        } else if (shape.type == "rectangle") {
            shape.y = NY - 1 - shape.y - shape.height;
        } else if (shape.type == "polygon") {
            for (auto& pt : shape.points) {
                pt.second = NY - 1 - pt.second;
            }
        }
    }

    double D = 60.0;
    if (!shapes.empty()) {
        double xmin = 1e18, xmax = -1e18, ymin = 1e18, ymax = -1e18;
        for (const auto& shape : shapes) {
            if (shape.type == "circle") {
                xmin = std::min(xmin, shape.x - shape.radius);
                xmax = std::max(xmax, shape.x + shape.radius);
                ymin = std::min(ymin, shape.y - shape.radius);
                ymax = std::max(ymax, shape.y + shape.radius);
            } else if (shape.type == "rectangle") {
                xmin = std::min(xmin, shape.x);
                xmax = std::max(xmax, shape.x + shape.width);
                ymin = std::min(ymin, shape.y);
                ymax = std::max(ymax, shape.y + shape.height);
            } else if (shape.type == "polygon") {
                for (const auto& pt : shape.points) {
                    xmin = std::min(xmin, pt.first);
                    xmax = std::max(xmax, pt.first);
                    ymin = std::min(ymin, pt.second);
                    ymax = std::max(ymax, pt.second);
                }
            }
        }
        double w = xmax - xmin;
        double h = ymax - ymin;
        D = std::max(w, h);
        if (D < 1.0) D = 60.0;
    }

    // Compute tau from Re
    double nu = u_inflow * D / re;
    double tau = 0.5 + 3.0 * nu;

    // Auto-LES for high Re
    if (tau < 0.55) {
        g_use_les = true;
    }

    // Create output directory
    std::string out_dir(output_dir);
    std::filesystem::create_directories(out_dir + "/frames");

    // Initialize system
    LBMCapabilities system;

    // Mark obstacles from geometry
    mark_obstacles_from_shapes(system, shapes);

    // Initialize with uniform inflow equilibrium
    for (int n = 0; n < NX * NY; ++n) {
        double* f_node = &system.f[n * 9];
        for (int i = 0; i < 9; ++i) {
            f_node[i] = compute_equilibrium(i, 1.0, u_inflow, 0.0);
        }
    }

    // Add perturbation downstream of obstacles to trigger instabilities
    std::mt19937 rng(42);
    std::uniform_real_distribution<double> pert_dist(-1e-4, 1e-4);
    for (int x = NX / 3; x < std::min(NX, NX / 3 + 60); ++x) {
        for (int y = 0; y < NY; ++y) {
            int n = node_index(x, y);
            if (system.obstacle[n]) continue;
            double* f_node = &system.f[n * 9];
            double v_pert = pert_dist(rng);
            double rho, u, v;
            compute_macros(f_node, rho, u, v);
            for (int i = 0; i < 9; ++i) {
                f_node[i] = compute_equilibrium(i, rho, u, v + v_pert);
            }
        }
    }

    // Save metadata
    std::string case_label = "custom";
    save_meta_json(out_dir, re, tau, u_inflow, D, case_label, NX, NY);

    // Run simulation
    for (int step = 0; step <= max_steps; ++step) {
        // Check cancel every 100 steps
        if (step % 100 == 0 && g_cancel_flag.load(std::memory_order_relaxed)) {
            return step;
        }

        execute_time_step(system, tau, u_inflow);

        // Save forces
        double fx_total = 0.0, fy_total = 0.0;
        for (int n = 0; n < NX * NY; ++n) {
            fx_total += system.fx_body[n];
            fy_total += system.fy_body[n];
        }
        save_forces_jsonl(out_dir, step, fx_total, fy_total);

        // Save frames
        if (step % save_interval == 0) {
            save_json_frame(system, step, out_dir);
            save_binary_frame(system, step, out_dir);
            if (g_frame_callback) {
                g_frame_callback(step);
            }
        }
    }

    return 0;
}

// ==========================================================================
// VTK Export: Write frame data as VTK Structured Points for ParaView
// ==========================================================================

static std::vector<double> parse_json_array_vtk(const std::string& json, const std::string& key) {
    std::vector<double> result;
    size_t pos = json.find("\"" + key + "\"");
    if (pos == std::string::npos) return result;
    pos = json.find('[', pos);
    if (pos == std::string::npos) return result;
    pos++;
    while (pos < json.size() && json[pos] != ']') {
        if (json[pos] == ',' || json[pos] == ' ') { pos++; continue; }
        if (json[pos] == 'n') { result.push_back(0.0); pos += 4; continue; }
        size_t end = pos;
        while (end < json.size() && json[end] != ',' && json[end] != ']') end++;
        try { result.push_back(std::stod(json.substr(pos, end - pos))); }
        catch (...) { result.push_back(0.0); }
        pos = end;
    }
    return result;
}

static int parse_json_int_vtk(const std::string& json, const std::string& key, int def) {
    size_t pos = json.find("\"" + key + "\"");
    if (pos == std::string::npos) return def;
    pos = json.find(':', pos);
    if (pos == std::string::npos) return def;
    pos++;
    while (pos < json.size() && json[pos] == ' ') pos++;
    std::string num;
    while (pos < json.size() && json[pos] >= '0' && json[pos] <= '9') num += json[pos++];
    return num.empty() ? def : std::stoi(num);
}

extern "C" int lbm_write_vtk(const char* source_dir, int step, const char* dest_path) {
    std::string frame_path = std::string(source_dir) + "/frames/frame_" + std::to_string(step) + ".json";
    std::ifstream in(frame_path);
    if (!in.is_open()) return -1;
    std::string json((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    in.close();

    int nx = parse_json_int_vtk(json, "nx", 0);
    int ny = parse_json_int_vtk(json, "ny", 0);
    if (nx <= 0 || ny <= 0) return -1;

    auto vel = parse_json_array_vtk(json, "velocity");
    auto u_arr = parse_json_array_vtk(json, "u");
    auto v_arr = parse_json_array_vtk(json, "v");
    auto p_arr = parse_json_array_vtk(json, "p");
    auto omega_arr = parse_json_array_vtk(json, "omega");
    auto obst_arr = parse_json_array_vtk(json, "obstacle");
    int n = nx * ny;

    std::ofstream vtk(dest_path);
    if (!vtk.is_open()) return -1;

    vtk << "# vtk DataFile Version 3.0\nAK-Vortex Frame " << step << "\nASCII\n";
    vtk << "DATASET STRUCTURED_POINTS\n";
    vtk << "DIMENSIONS " << nx << " " << ny << " 1\n";
    vtk << "ORIGIN 0 0 0\nSPACING 1 1 1\n";
    vtk << "POINT_DATA " << n << "\n";

    vtk << "SCALARS velocity double 1\nLOOKUP_TABLE default\n";
    for (int i = 0; i < n; ++i) vtk << (i < (int)vel.size() ? vel[i] : 0.0) << "\n";

    vtk << "VECTORS velocity_vector double\n";
    for (int i = 0; i < n; ++i) {
        vtk << (i < (int)u_arr.size() ? u_arr[i] : 0.0) << " "
            << (i < (int)v_arr.size() ? v_arr[i] : 0.0) << " 0.0\n";
    }

    vtk << "SCALARS pressure double 1\nLOOKUP_TABLE default\n";
    for (int i = 0; i < n; ++i) vtk << (i < (int)p_arr.size() ? p_arr[i] : 0.0) << "\n";

    vtk << "SCALARS vorticity double 1\nLOOKUP_TABLE default\n";
    for (int i = 0; i < n; ++i) vtk << (i < (int)omega_arr.size() ? omega_arr[i] : 0.0) << "\n";

    vtk << "SCALARS obstacle int 1\nLOOKUP_TABLE default\n";
    for (int i = 0; i < n; ++i) vtk << (i < (int)obst_arr.size() ? (int)obst_arr[i] : 0) << "\n";

    vtk.close();
    return 0;
}

// ==========================================================================
// Parameter Sweep Runner
// ==========================================================================

extern "C" int lbm_run_sweep(
    int nx, int ny,
    double re_min, double re_max, int re_steps,
    double u_inflow,
    int max_steps, int save_interval,
    const char* output_dir,
    const char* geometry_json
) {
    std::string out_dir(output_dir);
    std::filesystem::create_directories(out_dir);

    std::ofstream csv(out_dir + "/sweep_results.csv");
    csv << "Re,tau,max_velocity\n";

    for (int i = 0; i < re_steps; ++i) {
        // Check cancel between sweep iterations
        if (g_cancel_flag.load(std::memory_order_relaxed)) {
            csv.close();
            return i;
        }

        double re = re_min + (re_max - re_min) * i / (re_steps > 1 ? (re_steps - 1) : 1);
        std::string re_dir = out_dir + "/re" + std::to_string(static_cast<int>(re));
        std::filesystem::create_directories(re_dir);

        double nu = u_inflow * 60.0 / re;
        double tau = 0.5 + 3.0 * nu;

        lbm_solve_geometry(nx, ny, re, u_inflow, max_steps, save_interval, re_dir.c_str(), geometry_json);

        // Read last frame to get max velocity
        double max_vel = 0.0;
        std::string last_frame = re_dir + "/frames/frame_" + std::to_string(max_steps) + ".json";
        std::ifstream fin(last_frame);
        if (fin.is_open()) {
            std::string json_str((std::istreambuf_iterator<char>(fin)), std::istreambuf_iterator<char>());
            fin.close();
            auto vel = parse_json_array_vtk(json_str, "velocity");
            for (double v : vel) {
                if (v > max_vel) max_vel = v;
            }
        }

        csv << static_cast<int>(re) << "," << tau << "," << max_vel << "\n";

        reset_solver_state();
    }

    csv.close();
    return 0;
}

// ==========================================================================
// Grid Convergence Index (GCI) Study
// Runs the same case at 3 grid resolutions and computes GCI.
// ==========================================================================

extern "C" int lbm_run_gci(
    int nx_base, int ny_base,
    double re, double u_inflow,
    int max_steps, int save_interval,
    double refinement_ratio,
    const char* output_dir,
    const char* geometry_json
) {
    std::string out_dir(output_dir);
    std::filesystem::create_directories(out_dir);

    // Compute 3 grid sizes: coarse, medium, fine
    int grids[3][2];
    for (int i = 0; i < 3; ++i) {
        double factor = std::pow(refinement_ratio, 1.0 - i);
        grids[i][0] = static_cast<int>(nx_base * factor);
        grids[i][1] = static_cast<int>(ny_base * factor);
        // Ensure minimum grid size
        if (grids[i][0] < 100) grids[i][0] = 100;
        if (grids[i][1] < 100) grids[i][1] = 100;
    }

    double metrics[3] = {0, 0, 0};  // max velocity for each grid

    for (int i = 0; i < 3; ++i) {
        // Check cancel between GCI grid iterations
        if (g_cancel_flag.load(std::memory_order_relaxed)) {
            return i;
        }

        std::string grid_dir = out_dir + "/grid_" + std::to_string(i);
        std::filesystem::create_directories(grid_dir);

        lbm_solve_geometry(
            grids[i][0], grids[i][1],
            re, u_inflow,
            max_steps, save_interval,
            grid_dir.c_str(), geometry_json
        );

        // Extract max velocity from last frame
        std::string last_frame = grid_dir + "/frames/frame_" + std::to_string(max_steps) + ".json";
        std::ifstream fin(last_frame);
        if (fin.is_open()) {
            std::string json_str((std::istreambuf_iterator<char>(fin)), std::istreambuf_iterator<char>());
            fin.close();
            auto vel = parse_json_array_vtk(json_str, "velocity");
            for (double v : vel) {
                if (v > metrics[i]) metrics[i] = v;
            }
        }

        reset_solver_state();
    }

    // Compute GCI
    double f1 = metrics[2];  // finest
    double f2 = metrics[1];  // medium
    double f3 = metrics[0];  // coarsest
    double r = refinement_ratio;

    // Apparent order: p = ln(|f3-f2|/|f2-f1|) / ln(r)
    double p = std::log(std::abs(f3 - f2) / (std::abs(f2 - f1) + 1e-15)) / std::log(r);
    if (!std::isfinite(p) || p < 0) p = 2.0;  // default to 2nd order

    // GCI: GCI = F_s * |f2-f1| / (r^p - 1)
    double F_s = 1.25;  // safety factor
    double gci = F_s * std::abs(f2 - f1) / (std::pow(r, p) - 1.0);

    // Write results CSV
    std::ofstream csv(out_dir + "/gci_results.csv");
    csv << "Grid, Nx, Ny, MaxVelocity\n";
    csv << "Coarse," << grids[0][0] << "," << grids[0][1] << "," << metrics[0] << "\n";
    csv << "Medium," << grids[1][0] << "," << grids[1][1] << "," << metrics[1] << "\n";
    csv << "Fine," << grids[2][0] << "," << grids[2][1] << "," << metrics[2] << "\n";
    csv << "\nApparent Order," << p << "\n";
    csv << "GCI (Fine)," << gci << "\n";
    csv << "Refinement Ratio," << r << "\n";
    csv.close();

    return 0;
}
