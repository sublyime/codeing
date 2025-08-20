package com.chad;

import com.chad.model.Location;
import com.chad.repository.LocationRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    @Bean
    CommandLineRunner initDatabase(LocationRepository repo) {
        return args -> {
            repo.save(new Location("London", 51.5074, -0.1278));
            repo.save(new Location("Paris", 48.8566, 2.3522));
            repo.save(new Location("New York", 40.7128, -74.0060));
        };
    }
}
