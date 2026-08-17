cmake_minimum_required(VERSION 3.15)
project(AKVortex VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Homebrew libomp on macOS (Apple Clang lacks native OpenMP support)
if(APPLE)
  execute_process(
    COMMAND brew --prefix libomp
    OUTPUT_VARIABLE HOMEBREW_LIBOMP_PREFIX
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
  )
  if(HOMEBREW_LIBOMP_PREFIX)
    set(OpenMP_C_FLAGS "-Xpreprocessor -fopenmp -I${HOMEBREW_LIBOMP_PREFIX}/include")
    set(OpenMP_CXX_FLAGS "-Xpreprocessor -fopenmp -I${HOMEBREW_LIBOMP_PREFIX}/include")
    set(OpenMP_C_LIB_NAMES "omp")
    set(OpenMP_CXX_LIB_NAMES "omp")
    set(OpenMP_omp_LIBRARY "${HOMEBREW_LIBOMP_PREFIX}/lib/libomp.dylib")
  endif()
endif()

find_package(OpenMP REQUIRED)

# ------------------------------------------------------------------
# Lid-driven cavity executable
# ------------------------------------------------------------------
add_executable(LBM_Cavity src/cavity.cpp src/lbm.hpp src/lbm_types.hpp)
target_include_directories(LBM_Cavity PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(LBM_Cavity PRIVATE OpenMP::OpenMP_CXX)

# ------------------------------------------------------------------
# Backward-facing step executable
# ------------------------------------------------------------------
add_executable(LBM_Step src/step.cpp src/lbm.hpp src/lbm_types.hpp)
target_include_directories(LBM_Step PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(LBM_Step PRIVATE OpenMP::OpenMP_CXX)

# ------------------------------------------------------------------
# Orifice plate executable
# ------------------------------------------------------------------
add_executable(LBM_OrificePlate src/orifice_plate.cpp src/lbm.hpp src/lbm_types.hpp)
target_include_directories(LBM_OrificePlate PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(LBM_OrificePlate PRIVATE OpenMP::OpenMP_CXX)

# ------------------------------------------------------------------
# AMR test executable (cylinder with adaptive mesh refinement)
# ------------------------------------------------------------------
add_executable(LBM_AMR src/amr_test.cpp src/lbm.hpp src/lbm_types.hpp src/amr.hpp)
target_include_directories(LBM_AMR PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(LBM_AMR PRIVATE OpenMP::OpenMP_CXX)

# ------------------------------------------------------------------
# Unit tests (Google Test)
# ------------------------------------------------------------------
include(FetchContent)
FetchContent_Declare(
  googletest
  URL https://github.com/google/googletest/archive/refs/tags/v1.15.2.zip
)
set(BUILD_GMOCK OFF CACHE BOOL "" FORCE)
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

add_executable(LBM_Tests src/lbm_test.cpp src/lbm.hpp src/lbm_types.hpp)
target_include_directories(LBM_Tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(LBM_Tests PRIVATE GTest::gtest_main OpenMP::OpenMP_CXX)

add_executable(BodyFittedGrid_Tests src/body_fitted_grid_test.cpp src/body_fitted_grid.hpp src/geometry.hpp src/lbm_types.hpp)
target_include_directories(BodyFittedGrid_Tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(BodyFittedGrid_Tests PRIVATE GTest::gtest_main OpenMP::OpenMP_CXX)

# ------------------------------------------------------------------
# Custom targets
# ------------------------------------------------------------------
add_custom_target(cavity
  COMMAND LBM_Cavity
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
)

add_custom_target(step
  COMMAND LBM_Step
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
)

add_custom_target(amr
  COMMAND LBM_AMR
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
)

add_custom_target(serve-docs
  COMMAND python3 -m http.server 8765 -d ${CMAKE_SOURCE_DIR}/docs
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
)

# ------------------------------------------------------------------
# Shared library for Tauri FFI (desktop app)
# ------------------------------------------------------------------
add_library(lbm_solver_shared SHARED
    src/solver_c_api.cpp
    src/lbm.hpp
    src/lbm_types.hpp
    src/geometry.hpp
    src/thermal.hpp
    src/ibm.hpp
    src/wall_functions.hpp
    src/scalar_transport.hpp
    src/body_fitted_grid.hpp
)
target_include_directories(lbm_solver_shared PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(lbm_solver_shared PRIVATE OpenMP::OpenMP_CXX)
set_target_properties(lbm_solver_shared PROPERTIES
    POSITION_INDEPENDENT_CODE ON
    MACOSX_RPATH ON
    INSTALL_NAME_DIR "@rpath"
    BUILD_RPATH "${CMAKE_SOURCE_DIR}/build"
    INSTALL_RPATH "@loader_path/../lib"
)
