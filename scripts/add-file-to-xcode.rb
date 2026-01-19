#!/usr/bin/env ruby

# Script to add MashupManager.swift to Xcode project programmatically
# Requires xcodeproj gem: gem install xcodeproj

require 'xcodeproj'

def add_file_to_project(project_path, file_path, group_name, target_name)
  project = Xcodeproj::Project.open(project_path)

  # Find the group (folder) to add the file to
  group = project.main_group.find_subpath(group_name, true)

  # Add the file reference
  file_ref = group.new_reference(file_path)

  # Find the target
  target = project.targets.find { |t| t.name == target_name }

  # Add the file to the target's compile sources build phase
  target.add_file_references([file_ref])

  # Save the project
  project.save

  puts "✅ Added #{File.basename(file_path)} to #{target_name} target"
end

begin
  # iOS
  puts "Adding to iOS project..."
  add_file_to_project(
    '/Users/tombragg/dj-mix-generator/NotoriousDAD-iOS/NotoriousDAD.xcodeproj',
    '/Users/tombragg/dj-mix-generator/NotoriousDAD-iOS/NotoriousDAD/Services/MashupManager.swift',
    'NotoriousDAD/Services',
    'NotoriousDAD'
  )

  # macOS
  puts "Adding to macOS project..."
  add_file_to_project(
    '/Users/tombragg/dj-mix-generator/NotoriousDAD-macOS/NotoriousDAD.xcodeproj',
    '/Users/tombragg/dj-mix-generator/NotoriousDAD-macOS/NotoriousDAD/Services/MashupManager.swift',
    'NotoriousDAD/Services',
    'NotoriousDAD'
  )

  puts "\n✅ Files added successfully!"
  puts "Now rebuild the projects in Xcode."

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
