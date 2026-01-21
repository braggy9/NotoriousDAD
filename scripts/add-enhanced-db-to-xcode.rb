#!/usr/bin/env ruby

# Script to add enhanced-track-database.json to Xcode projects
# Requires xcodeproj gem: gem install xcodeproj

require 'xcodeproj'

def add_file_to_project(project_path, file_path, group_name, target_name)
  project = Xcodeproj::Project.open(project_path)

  # Find the group (folder) to add the file to
  group = project.main_group.find_subpath(group_name, true)

  # Check if file already exists
  existing_ref = group.files.find { |f| f.path == File.basename(file_path) }

  if existing_ref
    puts "File reference already exists, removing old one..."
    existing_ref.remove_from_project
  end

  # Add the file reference
  file_ref = group.new_reference(file_path)

  # Find the target
  target = project.targets.find { |t| t.name == target_name }

  # Add to resources build phase (not compile sources)
  resources_phase = target.resources_build_phase
  build_file = resources_phase.add_file_reference(file_ref)

  # Save the project
  project.save

  puts "✅ Added #{File.basename(file_path)} to #{target_name} target (Resources)"
end

begin
  # iOS
  puts "Adding enhanced-track-database.json to iOS project..."
  add_file_to_project(
    '/Users/tombragg/dj-mix-generator/NotoriousDAD-iOS/NotoriousDAD.xcodeproj',
    '/Users/tombragg/dj-mix-generator/NotoriousDAD-iOS/NotoriousDAD/Resources/enhanced-track-database.json',
    'NotoriousDAD/Resources',
    'NotoriousDAD'
  )

  # macOS
  puts "Adding enhanced-track-database.json to macOS project..."
  add_file_to_project(
    '/Users/tombragg/dj-mix-generator/NotoriousDAD-macOS/NotoriousDAD.xcodeproj',
    '/Users/tombragg/dj-mix-generator/NotoriousDAD-macOS/NotoriousDAD/Resources/enhanced-track-database.json',
    'NotoriousDAD/Resources',
    'NotoriousDAD'
  )

  puts "\n✅ Enhanced database added to both projects as Resources!"
  puts "Now rebuild the apps."

rescue LoadError
  puts "❌ xcodeproj gem not installed"
  puts "Run: gem install xcodeproj"
  puts "Then run this script again."
  exit 1
rescue => e
  puts "❌ Error: #{e.message}"
  puts e.backtrace
  exit 1
end
